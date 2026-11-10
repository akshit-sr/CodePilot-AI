import { LEVELS, LIMIT, MOD_KEY } from "../review.js";

// Severity counts (also the filter buttons), the size gauge, and the review button.
export function SheetFooter({ counts, filter, onFilter, showCounts, loading, code, size, canRun, reviewed, onRun }) {
  const tooBig = size > LIMIT;
  return <footer className="sheet-foot">
    {showCounts
      ? <div className="marks" role="group" aria-label="Filter notes by severity">
          {LEVELS.map(level =>
            <button
              key={level}
              className={`mark sev-${level}` + (filter === level ? " on" : "")}
              aria-pressed={filter === level}
              disabled={!counts[level]}
              onClick={() => onFilter(filter === level ? null : level)}
            >
              <b>{counts[level]}</b>{level}
            </button>
          )}
        </div>
      : <p className="unmarked">{loading ? "Marking…" : "Not marked yet."}</p>}

    <div className={"gauge" + (tooBig ? " over" : "")}>
      <span>{code ? code.split("\n").length : 0} lines</span>
      <i style={{ "--fill": Math.min(1, size / LIMIT) }} aria-hidden="true" />
      <span>{(size / 1000).toFixed(1)} / 30 KB</span>
    </div>

    <button className="primary" onClick={() => onRun()} disabled={!canRun}>
      {loading ? "Reading…" : reviewed ? "Mark it up again" : "Mark it up"}
      <span className="keys">{MOD_KEY} ↵</span>
    </button>
  </footer>;
}
