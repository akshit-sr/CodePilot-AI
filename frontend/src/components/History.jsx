import { X } from "lucide-react";
import { ABBR } from "../review.js";

// "Earlier sheets": past reviews, newest first. Click a card to reopen it, × to delete it.
export function History({ reviews, onOpen, onDelete }) {
  if (reviews.length === 0) return null;
  return <details className="past">
    <summary>Earlier sheets ({reviews.length})</summary>
    <ul>
      {reviews.map(r =>
        <li key={r.id}>
          <button onClick={() => onOpen(r.id)}>
            <span className="ext">{ABBR[r.language] || "TXT"}</span>
            <b>{r.filename}</b>
            <time dateTime={r.created_at}>
              {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </button>
          <button className="forget" aria-label={`Delete the review of ${r.filename}`} onClick={() => onDelete(r)}>
            <X size={14} />
          </button>
        </li>
      )}
    </ul>
  </details>;
}
