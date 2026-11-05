import { PenLine } from "lucide-react";
import { ABBR } from "../review.js";

export function FileTab({ filename, language, onRename, onRenamed }) {
  return <div className="file-tab">
    <span className="ext">{ABBR[language] || "TXT"}</span>
    <input
      className="filename"
      aria-label="File name"
      spellCheck="false"
      value={filename}
      size={Math.max(8, filename.length)}
      onChange={e => onRename(e.target.value)}
      onBlur={onRenamed}
    />
    <PenLine size={13} aria-hidden="true" />
  </div>;
}
