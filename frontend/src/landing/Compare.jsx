// Before and after: the reader's draft lies over the rewrite, and a slider clips the draft to reveal what changed.
// A real <input type="range"> covers the whole sheet, so dragging, touch and the arrow keys all work unaided.
import { useState } from "react";
import { PenLine } from "lucide-react";
import { SAMPLE } from "./content.js";
import { CodeLines } from "./CodeLines.jsx";

export function Compare() {
  const [percent, setPercent] = useState(50);
  const { code, removedLines, rewrite, addedLines } = SAMPLE;

  return (
    <div className="compare" style={{ "--x": `${percent}%` }}>
      <div className="cmp-layer after">
        <span className="cmp-label">Revised draft</span>
        <pre className="hs-code">
          <CodeLines lines={rewrite} lineClass={n => addedLines.has(n) && "fresh"} />
        </pre>
      </div>
      <div className="cmp-layer before" aria-hidden="true">
        <span className="cmp-label">Your draft</span>
        <pre className="hs-code">
          <CodeLines lines={code} lineClass={n => removedLines.has(n) && "struck"} />
        </pre>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={percent}
        onChange={event => setPercent(Number(event.target.value))}
        aria-label="Slide between your draft and the revised draft"
      />
      <span className="cmp-handle" aria-hidden="true">
        <PenLine size={15} />
      </span>
    </div>
  );
}
