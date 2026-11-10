"""Builds datasets/juliet.json from the NIST Juliet Test Suite for Java 1.3 (samate.nist.gov/SARD, public domain).

One simplest-form ("_01") test case per weakness. Only the flawed method is kept; every comment, the
word "bad" and the class name are removed so nothing hints at the answer. The known bug is the line
NIST marks with FLAW (the last one, the sink); earlier FLAW lines (the source) also count as a catch.
Run from eval/:  uv run python fetch_juliet.py   (downloads ~77 MB once into eval/.cache/)
"""
import json, re, urllib.request, zipfile
from pathlib import Path

URL = "https://samate.nist.gov/SARD/downloads/test-suites/2017-10-01-juliet-test-suite-for-java-v1-3.zip"
HERE = Path(__file__).parent
ZIP, OUT = HERE / ".cache" / "juliet-java-1.3.zip", HERE / "datasets" / "juliet.json"
PICK = {  # test case -> title shown on the page
    "CWE89_SQL_Injection__Environment_executeUpdate_01": "CWE-89 SQL injection",
    "CWE78_OS_Command_Injection__Environment_01": "CWE-78 OS command injection",
    "CWE80_XSS__Servlet_getParameter_Servlet_01": "CWE-80 Cross-site scripting",
    "CWE23_Relative_Path_Traversal__Environment_01": "CWE-23 Path traversal",
    "CWE259_Hard_Coded_Password__passwordAuth_01": "CWE-259 Hard-coded password",
    "CWE327_Use_Broken_Crypto__DES_01": "CWE-327 Broken crypto (DES)",
    "CWE328_Reversible_One_Way_Hash__MD5_01": "CWE-328 Weak hash (MD5)",
    "CWE369_Divide_by_Zero__int_zero_divide_01": "CWE-369 Divide by zero",
    "CWE190_Integer_Overflow__int_max_add_01": "CWE-190 Integer overflow",
    "CWE476_NULL_Pointer_Dereference__binary_if_01": "CWE-476 Null pointer dereference",
}


def extract(src):
    """(code, flaw lines): imports + the bad() method renamed run(), with all comments removed."""
    lines = src.splitlines()
    start = next(i for i, l in enumerate(lines) if "public void bad(" in l)
    depth, end = 0, start
    for end in range(start, len(lines)):
        depth += lines[end].count("{") - lines[end].count("}")
        if depth == 0 and "{" in "".join(lines[start:end + 1]):
            break
    out, flaws, pending, in_comment = [], [], False, False
    for l in lines[start:end + 1]:
        flagged = False
        if in_comment:
            pending |= "FLAW" in l and "FIX" not in l
            if "*/" not in l:
                continue
            in_comment, l = False, l.split("*/", 1)[1]
        while "/*" in l:
            pre, rest = l.split("/*", 1)
            text, closed, post = rest.partition("*/")
            flagged |= "FLAW" in text and "FIX" not in text
            if not closed:
                in_comment, l = True, pre
                break
            l = pre + post
        if "//" in l:
            l, text = l.split("//", 1)
            flagged |= "FLAW" in text
        if not l.strip():
            pending |= flagged
            continue
        out.append(re.sub(r"\bbad\b", "run", l.rstrip()))
        if flagged or pending:
            flaws.append(len(out))
            pending = False
    head = [l for l in lines if l.startswith("import ") and "testcasesupport" not in l] + ["", "public class Example", "{"]
    return "\n".join(head + out + ["}"]) + "\n", [f + len(head) for f in flaws]


def main():
    if not ZIP.exists():
        ZIP.parent.mkdir(exist_ok=True)
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (compatible; codepilot-eval)"})  # NIST rejects urllib's default
        with urllib.request.urlopen(req, timeout=600) as r:
            ZIP.write_bytes(r.read())
    z, cases = zipfile.ZipFile(ZIP), []
    for i, (name, title) in enumerate(PICK.items(), 1):
        path = next(n for n in z.namelist() if n.endswith(f"/{name}.java"))
        code, flaws = extract(z.read(path).decode("utf-8", "replace"))
        cases.append({"file": f"Case{i:02}.java", "title": title, "language": "java", "code": code,
                      "bugs": [{"line": flaws[-1], "also": flaws[:-1], "label": title}]})
    OUT.write_text(json.dumps({
        "title": "NIST Juliet",
        "description": f"{len(cases)} test cases from the NIST Juliet Test Suite for Java 1.3 (Software Assurance Reference Dataset, "
                       "samate.nist.gov), one per weakness type (CWE), in its simplest form. Comments, names and other hints "
                       "that reveal the flaw were removed before review.",
        "source": "https://samate.nist.gov/SARD/test-suites/111",
        "cases": cases,
    }, indent=2))
    print(f"Wrote {len(cases)} test cases to {OUT.name}")


if __name__ == "__main__":
    main()
