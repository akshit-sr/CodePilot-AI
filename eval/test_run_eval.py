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
    m = run_eval.evaluate("m", "url", None, 1)
    assert m["failures"] == 1 and m["recall"] == 1 and m["precision"] == 1


def test_findings_are_tagged_real_or_extra(monkeypatch):
    import run_eval
    monkeypatch.setattr(run_eval, "CASES", [{"file": "f", "bugs": [{"line": 4, "label": "a"}]}])
    monkeypatch.setattr(run_eval, "review", lambda *a: [{"line": 5}, {"line": 30}])
    found = run_eval.evaluate("m", "url", None, 1)["results"][0]["findings"]
    assert [f["real"] for f in found] == [True, False]


def test_prompt_matches_worker():
    from run_eval import ROOT, prompt
    worker = (ROOT / "worker" / "src" / "index.ts").read_text()
    text = prompt("a = 1\nb = 2", "python", "f.py")
    assert "1| a = 1\n2| b = 2" in text
    for line in text.split("SOURCE:")[0].splitlines()[1:]:
        assert line in worker, line
