import { expect, test } from "bun:test";
import { diffLines, downloadName, humanize, languageFor, prepare, renameFor, toMermaid, toNotes } from "./review.js";

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

test("download names get the language's extension only when missing one", () => {
  expect(downloadName("main", "python")).toBe("main.py");
  expect(downloadName("a.txt", "go")).toBe("a.txt");
  expect(downloadName(" ", "cpp")).toBe("untitled.cpp");
});

test("a translated file gets the target language's extension", () => {
  expect(renameFor("cart.js", "python")).toBe("cart.py");
  expect(renameFor("Makefile", "go")).toBe("Makefile.go");
});

test("flowchart data becomes mermaid text and flagged lines are painted", () => {
  const graph = {
    nodes: [{ id: "a", label: 'say "hi"', kind: "start", line: 1 }, { id: "b", label: "x?", kind: "decision", line: 3 }],
    edges: [{ from: "a", to: "b", label: "go" }, { from: "b", to: "a", label: "" }],
  };
  expect(toMermaid(graph, [{ line: 3 }])).toBe([
    "flowchart TD",
    '  n0(["say #quot;hi#quot;"])',
    '  n1{"x?"}',
    '  n0 -->|"go"| n1',
    "  n1 --> n0",
    "  classDef bug fill:#fbd5d5,stroke:#c0392b,color:#000",
    "  class n1 bug",
  ].join("\n"));
});

test("background prep makes the flowchart first, then the translation, even if the flowchart fails", async () => {
  const order = [];
  const api = {
    flowchart: async () => { order.push("flow"); throw Error("no"); },
    translate: async a => { order.push("translate:" + a.target); return { code: "c" }; },
  };
  const p = prepare(call => call(), api, "x", "javascript");
  await expect(p.flow).rejects.toThrow("no");
  expect(await p.translate).toEqual({ code: "c" });
  expect(order).toEqual(["flow", "translate:python"]);
});
