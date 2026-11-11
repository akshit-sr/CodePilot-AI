"""Scores each model on files with known bugs. Writes frontend/public/eval.json for the site's #eval page.

Run from eval/:  uv run python run_eval.py   (set FALLBACK_MODEL_KEY to include the Docker backup model)
                 uv run python run_eval.py quixbugs   (QuixBugs benchmark, after fetch_quixbugs.py)
                 uv run python run_eval.py juliet     (NIST Juliet, after fetch_juliet.py)
                 add --main-only to skip the backup model, --timeout=SECONDS for slow machines
"""
import json, os, shutil, sys, time, tomllib, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "eval.json"
PROGRESS = Path(__file__).parent / ".progress"
TOLERANCE = 1  # a finding within this many lines of a known bug counts as catching it

CASES = [
    {"file": "login.py", "language": "python", "code": '''import sqlite3

def login(db, uid, pw):
    q = f"SELECT * FROM users WHERE id={uid}"
    row = db.execute(q).fetchone()

    if row[2] == pw:
        return True

    print("bad login", uid, pw)
    return False
''', "bugs": [{"line": 4, "label": "SQL injection"}, {"line": 7, "label": "Plain-text password / missing row"}, {"line": 10, "label": "Password in logs"}]},
    {"file": "cart.js", "language": "javascript", "code": '''var discount = 0.1;

function total(items) {
  let sum = 0;
  for (let i = 0; i <= items.length; i++) {
    sum += items[i].price;
  }
  if (sum == "0") return null;
  return sum - sum * discount;
}
''', "bugs": [{"line": 1, "label": "Global variable"}, {"line": 5, "label": "Off by one"}, {"line": 8, "label": "Loose equality"}]},
    {"file": "greet.c", "language": "c", "code": '''#include <stdio.h>
#include <string.h>

void greet(const char *name) {
    char buf[16];
    strcpy(buf, name);
    strcat(buf, "!");

    printf(buf);
}

int main(int argc, char **argv) {
    greet(argv[1]);
}
''', "bugs": [{"line": 6, "label": "Buffer overflow"}, {"line": 9, "label": "Format string bug"}, {"line": 13, "label": "Missing argument check"}]},
    {"file": "Stats.java", "language": "java", "code": '''import java.util.List;

public class Stats {
    public static double average(List<Integer> xs) {
        int sum = 0;
        for (int x : xs) sum += x;
        return sum / xs.size();
    }

    public static String first(List<String> names) {
        return names.get(0).trim();
    }
}
''', "bugs": [{"line": 7, "label": "Integer division / empty list"}, {"line": 11, "label": "Empty list or null name"}]},
    {"file": "cat.go", "language": "go", "code": '''package main

import (
\t"fmt"
\t"os"
)

func main() {
\tf, _ := os.Open(os.Args[1])
\tbuf := make([]byte, 100)
\tf.Read(buf)
\tfmt.Println(string(buf))
}
''', "bugs": [{"line": 9, "label": "Ignored open error / missing arg"}, {"line": 11, "label": "Ignored read result"}]},
    {"file": "clamp.py", "language": "python", "code": '''def clamp(value: float, low: float, high: float) -> float:
    """Limit value to the range [low, high]."""
    if low > high:
        raise ValueError("low must not exceed high")
    return max(low, min(value, high))
''', "bugs": []},  # clean file: every finding here is a false alarm
]

LANGUAGE_NAMES = {"python": "Python", "javascript": "JavaScript", "c": "C", "java": "Java", "go": "Go"}


# ponytail: copy of the prompt in worker/src/index.ts so the scores match the live app; keep the two in sync.
def prompt(code, language, filename):
    numbered = "\n".join(f"{i}| {line}" for i, line in enumerate(code.split("\n"), 1))
    return f"""Review this {LANGUAGE_NAMES[language]} source file ({filename}). Return only valid JSON matching this schema:
{{"findings":[{{"type":"string","severity":"low|medium|high|critical","line":1,"column":1,"explanation":"string","suggested_fix":"string"}}],"improved_code":"string or null"}}
Report actionable problems: bugs and logical errors, security issues, inefficient code, poor coding practices, readability problems, unnecessary or repeated code, and unhandled edge cases. "type" is a short title for the problem, e.g. "SQL injection".
Each source line below starts with its line number and "| "; use that number for "line". The numbers are not part of the code: leave them out of improved_code.
Leave every comment exactly as written: in improved_code keep each one word for word, and do not suggest changes to comments.

SOURCE:
```{language}
{numbered}
```"""


def score(bugs, lines):
    """Returns (bugs caught, findings that match no bug)."""
    near = lambda line, bug: any(abs(line - b) <= TOLERANCE for b in [bug["line"], *bug.get("also", [])])
    caught = [b for b in bugs if any(near(l, b) for l in lines)]
    false_alarms = [l for l in lines if not any(near(l, b) for b in bugs)]
    return caught, false_alarms


def review(url, model, key, case, timeout):
    """Returns the model's findings as [{line, severity, type, explanation, suggested_fix}], or None if it failed or sent bad JSON."""
    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": "You are a precise code reviewer."},
                     {"role": "user", "content": prompt(case["code"], case["language"], case["file"])}],
        "temperature": 0, "reasoning_effort": "none", "response_format": {"type": "json_object"},
    }).encode()
    headers = {"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, body, headers), timeout=timeout) as r:
            content = json.load(r)["choices"][0]["message"]["content"]
        return [{"line": int(f["line"]), "severity": str(f.get("severity", "")), "type": str(f.get("type", "")),
                 "explanation": str(f.get("explanation", "")), "suggested_fix": str(f.get("suggested_fix", ""))} for f in json.loads(content)["findings"]]
    except Exception as e:
        print(f"  {case['file']}: failed ({e})")
        return None


def evaluate(name, url, key, timeout, cases, checkpoint=None):
    # Finished files are saved to `checkpoint` as we go, so a stopped run resumes instead of starting over.
    done = json.loads(checkpoint.read_text()) if checkpoint and checkpoint.exists() else {}
    results, caught_total, bugs_scored, findings, false_alarms, seconds = [], 0, 0, 0, 0, []
    for case in cases:
        if case["file"] in done:
            found, took = done[case["file"]]
        else:
            start = time.perf_counter()
            found = review(url, name, key, case, timeout)
            took = round(time.perf_counter() - start, 1)
            if checkpoint and found is not None:
                done[case["file"]] = [found, took]
                checkpoint.write_text(json.dumps(done))
        if found is not None:
            print(f"  {case['file']}: done ({took}s)", flush=True)
        if found is None:
            results.append({"error": True, "seconds": took})
            continue
        lines = [f["line"] for f in found]
        caught, extra = score(case["bugs"], lines)
        for f in found:
            f["real"] = f["line"] not in extra
        caught_total += len(caught); bugs_scored += len(case["bugs"]); findings += len(lines); false_alarms += len(extra); seconds.append(took)
        results.append({"caught": len(caught), "extra": len(extra), "missed": [b["label"] for b in case["bugs"] if b not in caught], "seconds": took, "findings": found})
    return {
        "name": name,
        "recall": caught_total / bugs_scored if bugs_scored else None,  # failed files don't count as misses
        "precision": (findings - false_alarms) / findings if findings else None,
        "avg_seconds": round(sum(seconds) / len(seconds), 1) if seconds else None,
        "failures": sum(1 for r in results if r.get("error")),
        "results": results,
    }


def main():
    # `run_eval.py` scores our own CASES; `run_eval.py quixbugs|juliet` scores a benchmark from datasets/.
    # `--main-only` skips the backup model; `--timeout=SECONDS` overrides MODEL_TIMEOUT_MS for slow machines.
    args = sys.argv[1:]
    bench = next((a for a in args if a in ("quixbugs", "juliet")), None)
    if bench:
        ds = json.loads((Path(__file__).parent / "datasets" / f"{bench}.json").read_text())
        cases, out, suite = ds["cases"], OUT.with_name(f"eval-{bench}.json"), {k: ds[k] for k in ("title", "description", "source")}
    else:
        cases, out = CASES, OUT
        suite = {"title": "Our test set", "description": f"{len(CASES)} files with {sum(len(c['bugs']) for c in CASES)} known bugs that we wrote."}
    env = tomllib.loads((ROOT / "worker" / "wrangler.toml").read_text())["vars"]
    timeout = next((int(a.split("=", 1)[1]) for a in args if a.startswith("--timeout=")), int(env.get("MODEL_TIMEOUT_MS", 120000)) / 1000)
    models = [(env["MODEL_NAME"], env["MODEL_URL"], None)]
    if env.get("FALLBACK_MODEL_URL") and "--main-only" not in args:
        models.append((env["FALLBACK_MODEL_NAME"], env["FALLBACK_MODEL_URL"], os.environ.get("FALLBACK_MODEL_KEY")))

    scores = []
    for name, url, key in models:
        print(f"Evaluating {name} ...", flush=True)
        checkpoint = PROGRESS / f"{out.stem}-{name.replace(':', '_')}.json"
        checkpoint.parent.mkdir(exist_ok=True)
        scores.append(evaluate(name, url, key, timeout, cases, checkpoint))

    if all(m["failures"] == len(cases) for m in scores):
        raise SystemExit(f"Every model call failed (are the tunnels up?); left {out.relative_to(ROOT)} unchanged.")
    out.write_text(json.dumps({
        "suite": suite,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tolerance": TOLERANCE,
        "total_bugs": sum(len(c["bugs"]) for c in cases),
        "cases": [{"file": c["file"], "title": c.get("title"), "language": c["language"], "code": c["code"], "bugs": c["bugs"]} for c in cases],
        "models": scores,
    }, indent=2))
    shutil.rmtree(PROGRESS, ignore_errors=True)  # finished: next run starts fresh

    pct = lambda x: "-" if x is None else f"{x:.0%}"
    print(f"\n{'model':<40}{'caught':>8}{'real':>8}{'s/file':>8}{'failed':>8}")
    for m in scores:
        print(f"{m['name']:<40}{pct(m['recall']):>8}{pct(m['precision']):>8}{m['avg_seconds'] or '-':>8}{m['failures']:>8}")
    print(f"\nWrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
