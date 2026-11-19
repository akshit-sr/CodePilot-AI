"""Downloads the QuixBugs Python programs (Lin et al. 2017, MIT) and writes datasets/quixbugs.json.

Each program has one known bug; its line comes from diffing the buggy file against the official fix.
All 40 programs are used except powerset, whose fix changes more than one line.
Run from eval/:  uv run python fetch_quixbugs.py
"""
import difflib, json, urllib.request
from pathlib import Path

COMMIT = "4257f44b0ff1181dedaedee6a447e133219fcebf"
RAW = f"https://raw.githubusercontent.com/jkoppel/QuixBugs/{COMMIT}"
PROGRAMS = ["bitcount", "breadth_first_search", "bucketsort", "depth_first_search", "detect_cycle", "find_first_in_sorted",
            "find_in_sorted", "flatten", "gcd", "get_factors", "hanoi", "is_valid_parenthesization", "kheapsort", "knapsack",
            "kth", "lcs_length", "levenshtein", "lis", "longest_common_subsequence", "max_sublist_sum", "mergesort",
            "minimum_spanning_tree", "next_palindrome", "next_permutation", "pascal", "possible_change", "quicksort",
            "reverse_linked_list", "rpn_eval", "shortest_path_length", "shortest_path_lengths", "shortest_paths",
            "shunting_yard", "sieve", "sqrt", "subsequences", "to_base", "topological_ordering", "wrap"]
OUT = Path(__file__).parent / "datasets" / "quixbugs.json"


def code_lines(text):
    """[(line number, normalized code)] for real code lines, stopping at the trailing docstring."""
    out = []
    for n, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if s.startswith('"""') and out:
            break
        if s and not s.startswith("#"):
            out.append((n, " ".join(s.split())))
    return out


def find_bug(buggy, fixed):
    """(buggy line number, fixed code) when exactly one line differs, else None."""
    b, f = code_lines(buggy), code_lines(fixed)
    ops = [o for o in difflib.SequenceMatcher(None, [s for _, s in b], [s for _, s in f], autojunk=False).get_opcodes() if o[0] != "equal"]
    if len(ops) != 1 or ops[0][2] - ops[0][1] > 1:
        return None
    _, i1, _, j1, j2 = ops[0]
    return b[min(i1, len(b) - 1)][0], "; ".join(s for _, s in f[j1:j2]) or "delete this line"


def main():
    get = lambda folder, name: urllib.request.urlopen(f"{RAW}/{folder}/{name}.py", timeout=30).read().decode()
    cases = []
    for name in PROGRAMS:
        buggy = get("python_programs", name)
        bug = find_bug(buggy, get("correct_python_programs", name))
        if not bug:
            raise SystemExit(f"{name}: expected exactly one changed line")
        cases.append({"file": f"{name}.py", "language": "python", "code": buggy, "bugs": [{"line": bug[0], "label": f"Fix: {bug[1]}"}]})
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "title": "QuixBugs benchmark",
        "description": f"{len(cases)} programs from QuixBugs (Lin, Koppel, Chen, Solar-Lezama. QuixBugs: A Multi-Lingual Program "
                       "Repair Benchmark. SPLASH 2017. MIT license): classic algorithms, each with one known bug, located by "
                       f"comparing it to the official fix.",
        "citation": "Lin, Koppel, Chen, Solar-Lezama. QuixBugs: A Multi-Lingual Program Repair Benchmark. SPLASH 2017.",
        "source": f"https://github.com/jkoppel/QuixBugs/tree/{COMMIT}",
        "license": "MIT",
        "cases": cases,
    }, indent=2))
    print(f"Wrote {len(cases)} programs to {OUT.name}")


if __name__ == "__main__":
    main()
