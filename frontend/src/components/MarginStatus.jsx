import { useEffect, useState } from "react";
import { MOD_KEY } from "../review.js";

// Shown while a review runs; after a while it explains why it may be slow (the backup model is much slower).
function Reading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(t);
  }, []);
  return <>
    <p className="reading">Reading your code<span className="pen" /></p>
    {slow && <p className="hint">Still working. If the main model is down, the backup is slower and can take a few minutes.</p>}
  </>;
}

// The message at the top of the margin: progress, an error, a hint, or a remark about the review.
// Only the first one that applies is shown, apart from the filter hint, which can follow another message.
export function MarginStatus({ loading, error, guess, languages, review, stale, filter, shownCount, filename, canRetry, onSwitch, onRetry, onShowAll }) {
  if (loading) return <Reading />;

  if (error) return <div className="slip error">
    <b>The review didn’t finish.</b>
    <p>{error}</p>
    {guess
      ? <button className="link" onClick={() => onSwitch(guess)}>It looks like {languages[guess]}. Switch and review</button>
      : canRetry && <button className="link" onClick={onRetry}>Try again</button>}
  </div>;

  if (!review) return <p className="hint">
    Notes appear here, next to the lines they refer to.
    Press <kbd>{MOD_KEY}</kbd> <kbd>↵</kbd> or <b>Mark it up</b> when you’re ready.
  </p>;

  const filterHint = filter && shownCount === 0 &&
    <p className="hint">No {filter} notes. <button className="link" onClick={onShowAll}>Show all</button></p>;

  if (review.notes.length === 0) return <>
    <div className="slip clean">
      <span className="big-tick">✓</span>
      <b>No marks.</b>
      <p>The reviewer found nothing to fix in {filename}.</p>
    </div>
    {review.touched && !stale && <CommentsTouched />}
  </>;

  if (stale) return <>
    <div className="slip stale">
      You’ve edited the code since this review, so notes may point at the wrong lines.
      {" "}<button className="link" onClick={onRetry}>Review again</button>
    </div>
    {filterHint}
  </>;

  return <>
    {review.touched && <CommentsTouched />}
    {filterHint}
  </>;
}

const CommentsTouched = () =>
  <div className="slip">The reviewer’s rewrite changed some of your comments, so it isn’t offered. The notes still apply.</div>;
