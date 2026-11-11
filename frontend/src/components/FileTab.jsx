import { PenLine, Plus, X } from "lucide-react";
import { ABBR } from "../review.js";

// One folder tab per open file. The current one holds the editable name; the others switch on click.
export function FileTab({ tabs, current, onSwitch, onClose, onNew, onRename, onRenamed }) {
  const close = t => (
    <button className="tab-x" aria-label={`Close ${t.filename}`} onClick={() => onClose(t.id)}>
      <X size={12} />
    </button>
  );
  return (
    <div className="file-tabs">
      {tabs.map(t =>
        t.id === current ? (
          <div className="file-tab" key={t.id}>
            <span className="ext">{ABBR[t.language] || "TXT"}</span>
            <input
              className="filename"
              aria-label="File name"
              spellCheck="false"
              value={t.filename}
              size={Math.max(8, t.filename.length)}
              onChange={e => onRename(e.target.value)}
              onBlur={onRenamed}
            />
            <PenLine size={13} aria-hidden="true" />
            {tabs.length > 1 && close(t)}
          </div>
        ) : (
          <div className="file-tab idle" key={t.id}>
            <button className="tab-open" onClick={() => onSwitch(t.id)}>
              <span className="ext">{ABBR[t.language] || "TXT"}</span>
              <span className="tab-name">{t.filename}</span>
            </button>
            {close(t)}
          </div>
        ),
      )}
      <button className="tab-new" aria-label="New file" onClick={onNew}>
        <Plus size={15} />
      </button>
    </div>
  );
}
