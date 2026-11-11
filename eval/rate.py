"""Manual quality rubric: you score the explanation and suggested fix of each finding that matched a known bug.

Run from eval/ after run_eval.py:  uv run python rate.py [quixbugs|juliet]
Ctrl+C stops; scores so far are kept and the next run carries on from there.
"""
import json, sys

from run_eval import OUT

TOP = 2
RUBRIC = """Score each from 0 to 2.
  Explanation: 0 wrong or misleading | 1 right problem but vague | 2 names the cause and what goes wrong
  Fix:         0 wrong or does not fix it | 1 fixes it only partly | 2 correct and complete"""


def quality(findings):
    """Average scores as a share of the top mark, or None where nothing is rated."""
    def mean(key):
        scores = [f[key] for f in findings if key in f]
        return sum(scores) / (TOP * len(scores)) if scores else None
    return {"rated": sum("explanation_score" in f for f in findings), "explanation": mean("explanation_score"), "fix": mean("fix_score")}


def ask(label):
    while (answer := input(f"  {label} (0-{TOP}): ").strip()) not in map(str, range(TOP + 1)):
        pass
    return int(answer)


def main():
    bench = next((a for a in sys.argv[1:] if a in ("quixbugs", "juliet")), None)
    path = OUT.with_name(f"eval-{bench}.json") if bench else OUT
    data = json.loads(path.read_text())
    print(RUBRIC)
    try:
        for m in data["models"]:
            for case, r in zip(data["cases"], m["results"]):
                lines = case["code"].split("\n")
                for f in r.get("findings", []):
                    if not f["real"] or "explanation_score" in f:
                        continue
                    print(f"\n{m['name']} | {case.get('title') or case['file']} | known bugs: {', '.join(b['label'] for b in case['bugs'])}")
                    print(f"  line {f['line']}: {lines[f['line'] - 1].strip() if f['line'] <= len(lines) else ''}")
                    print(f"  {f['type']}: {f['explanation']}")
                    # Result files made before fixes were recorded have none to rate: rerun run_eval.py for those.
                    if f.get("suggested_fix"):
                        print(f"  fix: {f['suggested_fix']}")
                    scores = {"explanation_score": ask("Explanation")}
                    if f.get("suggested_fix"):
                        scores["fix_score"] = ask("Fix")
                    f.update(scores)
    except (KeyboardInterrupt, EOFError):
        print("\nStopped.")
    for m in data["models"]:
        m["quality"] = {"rated_by": m.get("quality", {}).get("rated_by", "hand")} | quality([f for r in m["results"] for f in r.get("findings", [])])
        print(f"{m['name']}: {m['quality']}")
    path.write_text(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
