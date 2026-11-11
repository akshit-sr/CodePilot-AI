// Numbered, lightly highlighted lines of code for the landing page's illustrations.
// The highlighter only knows strings, a handful of keywords and the name in a definition, which is all the samples need.

const KEYWORDS = "import|def|if|is|None|return|for|let|var|const|function|void|char|int";
const TOKEN = new RegExp(`("[^"]*"|#include|\\b(?:${KEYWORDS})\\b|(?<=\\b(?:def|function|void|int) )\\w+(?=\\())`);
const IS_KEYWORD = new RegExp(`^(?:#include|${KEYWORDS})$`);

function tokenClass(text) {
  if (text.startsWith('"')) return "tok-string";
  if (IS_KEYWORD.test(text)) return "tok-keyword";
  return "tok-definition";
}

// Splitting on a pattern with one capture group leaves plain text at even positions and matches at odd ones.
function highlight(line) {
  return line.split(TOKEN).map((text, i) => ({ text, className: i % 2 === 1 ? tokenClass(text) : undefined }));
}

// With `boxTokens`, every word is wrapped separately so the "Parsed" layer can draw a box around each one.
function Piece({ text, className, boxTokens }) {
  if (!boxTokens) return <span className={className}>{text}</span>;
  return text.split(/(\s+)/).map((word, i) => {
    const isSpace = word.trim() === "";
    return (
      <span key={i} className={isSpace ? undefined : `tk ${className ?? ""}`}>
        {word}
      </span>
    );
  });
}

// One line: its number, then its highlighted text.
export function CodeLine({ number, text, boxTokens = false }) {
  return (
    <>
      <span className="ln">{number}</span>
      <span className="t">
        {highlight(text).map((piece, i) => (
          <Piece key={i} {...piece} boxTokens={boxTokens} />
        ))}
      </span>
    </>
  );
}

// A whole file. `lineClass(n)` may return a class for line number n, for example to mark it as changed.
export function CodeLines({ lines, lineClass, boxTokens = false }) {
  return lines.map((line, i) => (
    <div key={i} className={lineClass?.(i + 1) || undefined}>
      <CodeLine number={i + 1} text={line} boxTokens={boxTokens} />
    </div>
  ));
}
