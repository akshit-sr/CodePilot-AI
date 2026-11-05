import { expect, test } from "bun:test";
import { diffLines, humanize, languageFor, toNotes } from "./review.js";

test("findings become numbered notes, sorted by line then severity", () => {
  const notes = toNotes([
    { line: 5, severity: "low", type: "a" },
    { line: "2", severity: "HIGH", type: "b" },
    { line: 5, severity: "critical", type: "c" },
    { line: 0, severity: "weird", type: "d" },
  ]);
  expect(notes.map(n => [n.n, n.line, n.severity, n.type])).toEqual([
    [1, 1, "low", "d"],
    [2, 2, "high", "b"],
    [3, 5, "critical", "c"],
    [4, 5, "low", "a"],
  ]);
});

test("diff keeps, removes and adds lines with the right numbers", () => {
  expect(diffLines("a\nb\nc\n", "a\nB\nc\nd")).toEqual([
    [" ", "a", 1],
    ["-", "b", 2],
    ["+", "B", 2],
    [" ", "c", 3],
    ["+", "d", 4],
  ]);
  expect(diffLines("x\r\ny", "x\ny\n")).toEqual([[" ", "x", 1], [" ", "y", 2]]);
});

test("small helpers", () => {
  expect(humanize("sql_injection")).toBe("Sql injection");
  expect(humanize(undefined)).toBe("Finding");
  expect(languageFor("Main.PY")).toBe("python");
  expect(languageFor("notes.txt")).toBeUndefined();
});
