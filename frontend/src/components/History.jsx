import { X } from "lucide-react";
import { ABBR } from "../review.js";

// "Earlier sheets": past reviews, newest first. Click a card to reopen it, × to delete it.
export function History({ reviews, onOpen, onDelete }) {
  if (reviews.length === 0) return null;
  return <section className="past">
    <h2>Earlier sheets</h2>
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
          <button className="forget" title="Delete" aria-label={`Delete the review of ${r.filename}`} onClick={() => onDelete(r)}>
            <X size={14} />
          </button>
        </li>
      )}
    </ul>
  </section>;
}
