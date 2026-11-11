from run_eval import CASES, score


def test_score_counts_near_hits_and_false_alarms():
    bugs = [{"line": 4, "label": "a"}, {"line": 10, "label": "b"}]
    caught, extra = score(bugs, [5, 20])
    assert [b["label"] for b in caught] == ["a"]
    assert extra == [20]


def test_no_findings_catches_nothing():
    assert score([{"line": 1, "label": "a"}], []) == ([], [])


def test_bug_lines_point_at_code():
    for case in CASES:
        lines = case["code"].splitlines()
        for bug in case["bugs"]:
            assert lines[bug["line"] - 1].strip(), f"{case['file']} line {bug['line']} is blank"


def test_failed_files_are_not_counted_as_misses(monkeypatch):
    import run_eval
    replies = iter([None] + [[{"line": b["line"]} for b in c["bugs"]] for c in CASES[1:]])
    monkeypatch.setattr(run_eval, "review", lambda *a: next(replies))
    m = run_eval.evaluate("m", "url", None, 1, CASES)
    assert m["failures"] == 1 and m["recall"] == 1 and m["precision"] == 1


def test_findings_are_tagged_real_or_extra(monkeypatch):
    import run_eval
    monkeypatch.setattr(run_eval, "review", lambda *a: [{"line": 5}, {"line": 30}])
    found = run_eval.evaluate("m", "url", None, 1, [{"file": "f", "bugs": [{"line": 4, "label": "a"}]}])["results"][0]["findings"]
    assert [f["real"] for f in found] == [True, False]


def test_find_bug_changed_line_ignores_docstring_and_blanks():
    from fetch_quixbugs import find_bug
    buggy = 'def gcd(a, b):\n    if b == 0:\n        return a\n    return gcd(a % b, b)\n\n"""\nGreatest common divisor\n"""\n'
    fixed = '\ndef gcd(a, b):\n\n    if b == 0:\n        return a\n    return gcd(b, a % b)\n'
    assert find_bug(buggy, fixed) == (4, "return gcd(b, a % b)")


def test_find_bug_missing_line_points_at_the_gap():
    from fetch_quixbugs import find_bug
    assert find_bug("a = 1\nc = 3\n", "a = 1\nb = 2\nc = 3\n") == (2, "b = 2")


def test_find_bug_rejects_multi_line_changes():
    from fetch_quixbugs import find_bug
    assert find_bug("a = 1\nb = 2\nc = 3\n", "a = 9\nb = 2\nc = 9\n") is None


def test_prompt_matches_worker():
    from run_eval import ROOT, prompt
    worker = (ROOT / "worker" / "src" / "index.ts").read_text()
    text = prompt("a = 1\nb = 2", "python", "f.py")
    assert "1| a = 1\n2| b = 2" in text
    for line in text.split("SOURCE:")[0].splitlines()[1:]:
        assert line in worker, line


def test_resume_skips_files_already_done(monkeypatch, tmp_path):
    import run_eval
    cases = [{"file": "a", "bugs": [{"line": 1, "label": "x"}]}, {"file": "b", "bugs": [{"line": 2, "label": "y"}]}]
    checkpoint = tmp_path / "progress.json"
    checkpoint.write_text('{"a": [[{"line": 1}], 3.0]}')
    asked = []
    monkeypatch.setattr(run_eval, "review", lambda url, model, key, case, timeout: asked.append(case["file"]) or [{"line": 2}])
    m = run_eval.evaluate("m", "url", None, 1, cases, checkpoint)
    assert asked == ["b"] and m["recall"] == 1
    assert set(run_eval.json.loads(checkpoint.read_text())) == {"a", "b"}


def test_quality_averages_only_rated_findings():
    from rate import quality
    findings = [{"explanation_score": 2, "fix_score": 1}, {"explanation_score": 1}, {}]
    assert quality(findings) == {"rated": 2, "explanation": 0.75, "fix": 0.5}
    assert quality([{}]) == {"rated": 0, "explanation": None, "fix": None}


def test_source_line_also_counts_as_a_catch():
    caught, extra = score([{"line": 10, "also": [4], "label": "a"}], [4])
    assert len(caught) == 1 and extra == []


def test_juliet_extract_strips_hints():
    from fetch_juliet import extract
    src = """/* header naming CWE-369 */
import java.util.*;
import testcasesupport.*;
public class CWE369_Divide_by_Zero__x_01 extends AbstractTestCase
{
    public void bad() throws Throwable
    {
        int data;

        data = 0; /* POTENTIAL FLAW: zero */

        /* POTENTIAL FLAW: divide
        by zero */
        IO.writeLine("bad: " + (100 / data));
    }

    public void good() throws Throwable
    {
        int data = 2; /* FIX: non-zero */
    }
}
"""
    code, flaws = extract(src)
    lines = code.splitlines()
    assert [lines[f - 1].strip() for f in flaws] == ["data = 0;", 'IO.writeLine("run: " + (100 / data));']
    assert "public void run()" in code and "good" not in code and "FLAW" not in code and "CWE" not in code and "testcasesupport" not in code


def test_benchmark_datasets_hide_the_answer_and_point_at_code():
    import json, re
    from pathlib import Path
    for name in ("quixbugs", "juliet"):
        path = Path(__file__).parent / "datasets" / f"{name}.json"
        for case in json.loads(path.read_text())["cases"]:
            lines = case["code"].splitlines()
            for bug in case["bugs"]:
                for line in [bug["line"], *bug.get("also", [])]:
                    assert lines[line - 1].strip(), f"{name} {case['file']} line {line} is blank"
            if name == "juliet":
                assert not re.search(r"FLAW|FIX|CWE|\bbad\b|\bgood", case["code"]), case["file"]
