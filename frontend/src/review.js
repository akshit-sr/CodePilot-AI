// Constants and pure helpers for the review workspace. No React here, so it's all unit-testable.

// Used until /languages answers, or if it never does.
export const FALLBACK_LANGUAGES = {
  python: "Python", javascript: "JavaScript", typescript: "TypeScript", java: "Java",
  c: "C", cpp: "C++", csharp: "C#", go: "Go", rust: "Rust", php: "PHP", ruby: "Ruby", kotlin: "Kotlin",
};

// File extension -> language id.
export const EXT = {
  py: "python", js: "javascript", mjs: "javascript", ts: "typescript", java: "java",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp",
  go: "go", rs: "rust", php: "php", rb: "ruby", kt: "kotlin",
};

// Short label shown on file tabs and history cards.
export const ABBR = {
  python: "PY", javascript: "JS", typescript: "TS", java: "JAVA", c: "C", cpp: "C++",
  csharp: "C#", go: "GO", rust: "RS", php: "PHP", ruby: "RB", kotlin: "KT",
};

// Most severe first.
export const LEVELS = ["critical", "high", "medium", "low"];

// Same limit as the Worker (100 KB).
export const LIMIT = 100_000;

// The Worker's error codes, in words.
export const ERRORS = {
  unsupported_language: "That language isn’t supported yet.",
  code_too_large: "This file is over the 100 KB limit.",
  model_unavailable: "The review model is unavailable. Check that the model service is running.",
  model_timeout: "The model took too long to answer. Try again in a moment.",
  malformed_model_output: "The model returned an unreadable review. Try again.",
  sign_in_required: "Your session has expired. Sign out and sign in again.",
  daily_limit_reached: "You’ve used all of today’s reviews. The count resets at midnight UTC.",
  database_unavailable: "The review service can’t reach its database. Try again in a moment.",
};

export const MOD_KEY = /Mac|iPhone|iPad/.test(globalThis.navigator?.userAgent) ? "⌘" : "Ctrl";

// "sql_injection" -> "Sql injection"
export const humanize = type => (type || "finding").replace(/[_-]+/g, " ").replace(/^./, c => c.toUpperCase());

// "main.py" -> "python", or undefined for an unknown extension.
export const languageFor = filename => EXT[filename.split(".").pop().toLowerCase()];

// Model findings -> margin notes: line and severity cleaned up, sorted by line, numbered from 1.
export function toNotes(findings) {
  return findings
    .map(f => {
      const severity = String(f.severity).toLowerCase();
      return {
        ...f,
        line: Math.max(1, parseInt(f.line) || 1),
        severity: LEVELS.includes(severity) ? severity : "low",
      };
    })
    .sort((a, b) => a.line - b.line || LEVELS.indexOf(a.severity) - LEVELS.indexOf(b.severity))
    .map((note, i) => ({ ...note, n: i + 1 }));
}

// Line diff for the Changes view. Returns rows of [op, text, lineNumber]:
// op " " is unchanged, "-" is your line, "+" is the reviewer's.
// ponytail: O(n·m) LCS on the changed middle only; switch to Myers if huge rewrites get slow.
export function diffLines(before, after) {
  const a = before.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const b = after.replace(/\r\n/g, "\n").trimEnd().split("\n");

  // Skip the common start and end; only the middle needs the LCS table.
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const A = a.slice(start, a.length - end), B = b.slice(start, b.length - end);

  // lcs[i][j] = length of the longest common subsequence of A[i..] and B[j..].
  const lcs = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const rows = a.slice(0, start).map((text, k) => [" ", text, k + 1]);
  let i = 0, j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) {
      rows.push([" ", A[i], start + j + 1]); i++; j++;
    } else if (i < A.length && (j === B.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      rows.push(["-", A[i], start + i + 1]); i++;
    } else {
      rows.push(["+", B[j], start + j + 1]); j++;
    }
  }
  return rows.concat(b.slice(b.length - end).map((text, k) => [" ", text, b.length - end + k + 1]));
}
