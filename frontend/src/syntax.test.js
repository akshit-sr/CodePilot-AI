import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { syntaxChecker } from "./syntax.js";
import { SAMPLES as EXAMPLES } from "./samples.js";

const check = syntaxChecker(lang => fileURLToPath(new URL(`../public/grammars/${lang}.wasm`, import.meta.url)));

// [valid, broken] per language, as the backend tests had them.
const SAMPLES = {
  python: ["x = 1", "def broken(:"],
  javascript: ["const x = 1;", "function ( {"],
  typescript: ["const x: number = 1;", "function ( {"],
  java: ["class A { int x = 1; }", "class A { int x = ; "],
  c: ["int main(void) { return 0; }", "int main( {"],
  cpp: ["int main() { return 0; }", "int main( {"],
  csharp: ["class A { int x = 1; }", "class A { int x = ; "],
  go: ["package main\nfunc main() {}", "package main\nfunc main( {"],
  rust: ["fn main() {}", "fn main( {"],
  php: ["<?php echo 1;", "<?php function ( {"],
  ruby: ["x = 1", "def (("],
  kotlin: ["fun main() {}", "fun main( {"],
};

test("examples and samples cover the same languages", () => {
  expect(Object.keys(EXAMPLES).sort()).toEqual(Object.keys(SAMPLES).sort());
});

for (const [lang, [valid, broken]] of Object.entries(SAMPLES))
  test(lang, async () => {
    expect(await check.hasError(valid, lang)).toBe(false);
    expect(await check.hasError(broken, lang)).toBe(true);
    expect(await check.hasError(EXAMPLES[lang][1], lang)).toBe(false);
  });

test("suggests the right language", async () => {
  expect(await check.detect("const x = () => { return 1 }", "python")).toBe("javascript");
});
