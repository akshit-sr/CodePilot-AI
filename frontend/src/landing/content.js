// Everything the landing page says and shows. The reviews here are scripted, so the page works without the model.

// The file that gets taken apart in the opening scene, and compared in the slider further down.
export const SAMPLE = {
  code: [
    "import sqlite3",
    "",
    "def login(db, uid, pw):",
    '    q = f"SELECT * FROM users WHERE id={uid}"',
    "    row = db.execute(q).fetchone()",
    "",
    "    if row[2] == pw:",
    "        return True",
    "",
    '    print("bad login", uid, pw)',
    "    return False",
  ],
  problems: [
    { line: 4, sev: "critical", title: "SQL injection", fix: "Use ? placeholders." },
    { line: 7, sev: "high", title: "Plain-text password", fix: "Compare salted hashes." },
    { line: 10, sev: "medium", title: "Password in logs", fix: "Never log credentials." },
  ],
  // Lines of `code` that the rewrite replaces.
  removedLines: new Set([4, 5, 7, 10]),
  rewrite: [
    "import sqlite3",
    "",
    "def login(db, uid, pw):",
    '    q = "SELECT * FROM users WHERE id = ?"',
    "    row = db.execute(q, (uid,)).fetchone()",
    "",
    "    if row is None:",
    "        return False",
    "    return check_hash(row[2], pw)",
  ],
  // Lines of `rewrite` that are new.
  addedLines: new Set([4, 5, 7, 8, 9]),
};

// The four stages of a review, in order. Each one is a layer in the opening scene.
export const STAGES = [
  {
    name: "Parsed",
    title: "First it checks this is real code",
    text: "Before anything is sent, a parser confirms the file is valid code in its language, whichever of the twelve it is. If it isn’t, CodePilot suggests the language it looks like.",
  },
  {
    name: "Read",
    title: "Then every line gets read",
    text: "The reviewer goes through the file looking for bugs, security risks and messy corners.",
  },
  {
    name: "Ranked",
    title: "Each problem gets a rank",
    text: "Critical, high, medium or low, each with a note on how to fix it, so you know what to deal with first.",
  },
  {
    name: "Rewritten",
    title: "And a fixed file comes back",
    text: "A rewritten version with every problem dealt with. Take it, or keep yours and fix things your own way.",
  },
];

// The files offered in "Try it on a sample".
export const DEMOS = [
  { file: "login.py", ext: "PY", lang: "Python", code: SAMPLE.code, notes: SAMPLE.problems },
  {
    file: "cart.js",
    ext: "JS",
    lang: "JavaScript",
    code: [
      "var discount = 0.1;",
      "",
      "function total(items) {",
      "  let sum = 0;",
      "  for (let i = 0; i <= items.length; i++) {",
      "    sum += items[i].price;",
      "  }",
      '  if (sum == "0") return null;',
      "  return sum - sum * discount;",
      "}",
    ],
    notes: [
      { line: 1, sev: "low", title: "Global variable", fix: "Use const in a module." },
      { line: 5, sev: "high", title: "Off by one", fix: "Loop while i < length." },
      { line: 8, sev: "medium", title: "Loose equality", fix: "Use === and return 0." },
    ],
  },
  {
    file: "greet.c",
    ext: "C",
    lang: "C",
    code: [
      "#include <stdio.h>",
      "#include <string.h>",
      "",
      "void greet(const char *name) {",
      "    char buf[16];",
      "    strcpy(buf, name);",
      '    strcat(buf, "!");',
      "",
      "    printf(buf);",
      "}",
      "",
      "int main(int argc, char **argv) {",
      "    greet(argv[1]);",
      "}",
    ],
    notes: [
      { line: 6, sev: "critical", title: "Buffer overflow", fix: "snprintf(buf, sizeof buf, …)" },
      { line: 9, sev: "high", title: "Format string bug", fix: 'printf("%s", buf).' },
      { line: 13, sev: "medium", title: "Missing argument", fix: "Check argc > 1 first." },
    ],
  },
];

// The four severity ranks, each with a line of code that would earn it.
export const RANKS = [
  { sev: "critical", text: "Someone could exploit it today.", code: 'q = f"SELECT * FROM users WHERE id={uid}"' },
  { sev: "high", text: "A real bug or security risk. Fix it before you ship.", code: 'API_KEY = "demo-secret-123"' },
  { sev: "medium", text: "Works until the day it doesn’t.", code: 'if (sum == "0") return null;' },
  { sev: "low", text: "A tidy-up that helps the next reader.", code: "var discount = 0.1;" },
];

// What the slider's rewrite changed, by line.
export const REWRITE_NOTES = [
  ["4–5", "A ? placeholder instead of pasting uid into the SQL."],
  ["7–8", "A missing user returns False instead of crashing."],
  ["9", "Hashes are compared, and the password is never logged."],
];
