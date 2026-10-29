// Syntax check in the browser, so the Worker stays small. Grammars live in frontend/public/grammars,
// taken from each language's official npm package (tree-sitter-<lang>; Kotlin from @tree-sitter-grammars).

// Tried in order when the selected language fails to parse. PHP, Kotlin and Ruby parsers accept
// almost anything, so they also need a telltale sign in the code.
const DETECT_ORDER = ["python", "javascript", "typescript", "java", "kotlin", "go", "rust", "csharp", "c", "cpp", "ruby", "php"];
const DETECT_HINTS = { php: /<\?php/, kotlin: /\b(fun|val)\s/, ruby: /^\s*end\s*$/m };

// `grammarUrl(lang)` gives a grammar's wasm URL or path; `runtime` is web-tree-sitter's own wasm.
export function syntaxChecker(grammarUrl, runtime) {
  // The parser is loaded on the first check, so pages that never check code don't download it.
  let ready;
  const load = () => ready ??= import("web-tree-sitter").then(async ts => (await ts.Parser.init(runtime ? { locateFile: () => runtime } : undefined), ts));
  const parsers = {};
  const parserFor = lang => parsers[lang] ??= load().then(async ({ Language, Parser }) => {
    const parser = new Parser();
    parser.setLanguage(await Language.load(grammarUrl(lang)));
    return parser;
  });
  const hasError = async (code, lang) => (await parserFor(lang)).parse(code).rootNode.hasError;
  return {
    hasError,
    // ponytail: first clean parse wins; swap for a real classifier if guesses are often wrong
    async detect(code, selected) {
      for (const lang of DETECT_ORDER)
        if (lang !== selected && (!DETECT_HINTS[lang] || DETECT_HINTS[lang].test(code)) && !await hasError(code, lang)) return lang;
      return null;
    },
  };
}
