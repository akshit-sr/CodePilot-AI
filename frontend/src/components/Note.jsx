import { humanize } from "../review.js";

// One margin note. Its `top` is set by Workspace so it sits beside its line.
export function Note({ note, index, active, onHover, onOpen }) {
  return (
    <button
      data-line={note.line}
      style={{ "--d": index }}
      className={`note sev-${note.severity}` + (active ? " is-active" : "")}
      onMouseEnter={() => onHover(note.n)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(note.n)}
      onBlur={() => onHover(null)}
      onClick={() => onOpen(note)}
    >
      <span className="note-meta">
        <span className="num">{note.n}</span>
        {note.severity}
        <span className="where">line {note.line}</span>
      </span>
      <b>{humanize(note.type)}</b>
      <span className="explain">{note.explanation}</span>
      {note.suggested_fix && <span className="fix">→ {note.suggested_fix}</span>}
    </button>
  );
}
