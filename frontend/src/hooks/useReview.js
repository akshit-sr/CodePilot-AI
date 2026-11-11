// The review itself and everything it needs from the server: running a review, reopening or deleting
// a past one, plus what the page shows about the server (languages, today's quota, history).
import { useEffect, useRef, useState } from "react";
import parserRuntime from "web-tree-sitter/web-tree-sitter.wasm?url";
import { useApi } from "../api.js";
import { syntaxChecker } from "../syntax.js";
import { ERRORS, FALLBACK_LANGUAGES, LIMIT, prepare, renameFor, toNotes } from "../review.js";

const syntax = syntaxChecker(lang => `/grammars/${lang}.wasm`, parserRuntime);

// The reviewer may not touch comments: a rewrite that drops or edits one (or can't be checked) isn't offered.
async function checkRewrite(code, improved, lang) {
  if (!improved) return { improved: null };
  const kept = await syntax.keepsComments(code, improved, lang).catch(() => false);
  return kept ? { improved } : { improved: null, touched: true };
}

// `draft` comes from useDraft(). `onStart` runs as each review starts, so the page can reset its view.
export function useReview(draft, onStart) {
  const api = useApi();
  const { code, filename, language } = draft;

  const [languages, setLanguages] = useState(FALLBACK_LANGUAGES);
  const [usage, setUsage] = useState(null); // { limit, left }
  const [history, setHistory] = useState([]); // [{ id, filename, language, created_at }]

  const [review, setReview] = useState(null); // { notes, improved, code, touched? }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [guess, setGuess] = useState(null); // language suggested after a syntax error
  const [prepared, setPrepared] = useState(null); // flowchart + translation started after a review (see prepare)

  useEffect(() => {
    api
      .languages()
      .then(setLanguages)
      .catch(() => {});
    api
      .usage()
      .then(u => u && setUsage(u))
      .catch(() => {});
    loadHistory();
  }, []);

  function loadHistory() {
    api
      .history()
      .then(h => Array.isArray(h) && setHistory(h))
      .catch(() => {});
  }

  // Detect the language of pasted code. When a sizeable chunk lands on an empty sheet and it doesn't parse as the
  // selected language but does parse as another, switch to that one. Typing never triggers this.
  const wasEmpty = useRef(!code.trim());
  useEffect(() => {
    const pasted = wasEmpty.current && code.trim().length > 40;
    wasEmpty.current = !code.trim();
    if (!pasted) return;
    let outdated = false;
    (async () => {
      if (!(await syntax.hasError(code, language).catch(() => false))) return;
      const detected = await syntax.detect(code, language).catch(() => null);
      if (!detected || outdated) return;
      draft.setLanguage(detected);
      draft.setFilename(renameFor(filename, detected)); // untitled.py -> untitled.js
    })();
    return () => {
      outdated = true;
    };
  }, [code]);

  // Put new code on the sheet, dropping the old review.
  function load(text, name, lang) {
    draft.setCode(text);
    draft.setFilename(name);
    draft.setLanguage(lang);
    setReview(null);
    setError("");
    setPrepared(null);
  }

  // Bring back a sheet that was set aside in a tab.
  function restore(t) {
    draft.setCode(t.code);
    draft.setFilename(t.filename);
    draft.setLanguage(t.language);
    setReview(t.review ?? null);
    setPrepared(t.prepared ?? null);
    setError("");
    setGuess(null);
  }

  async function run(lang = language) {
    if (!code.trim() || new Blob([code]).size > LIMIT || loading) return;
    setLoading(true);
    setError("");
    setGuess(null);
    setPrepared(null);
    onStart();
    try {
      // Catch syntax errors here, before using up a review. If a grammar fails to load, the check is skipped.
      if (await syntax.hasError(code, lang).catch(() => false)) {
        setGuess(await syntax.detect(code, lang).catch(() => null));
        throw Error(`This doesn’t parse as ${languages[lang]}. Check the Language setting, or fix the syntax error.`);
      }

      const r = await api.review({ code, language: lang, filename });
      const data = await r.json().catch(() => ({}));
      if (data.detail === "daily_limit_reached") setUsage(u => u && { ...u, left: 0 });
      if (!r.ok)
        throw Error(
          ERRORS[data.detail] ||
            (r.status >= 500
              ? "The review API is unavailable. Start the backend and try again."
              : `Review failed (HTTP ${r.status}).`),
        );

      const findings = Array.isArray(data.findings) ? data.findings : [];
      setReview({
        notes: toNotes(findings),
        ...(await checkRewrite(code, data.improved_code, lang)),
        code,
        backup: data.backup ?? null,
      });
      if (typeof data.reviews_left === "number") setUsage(u => u && { ...u, left: data.reviews_left });
      loadHistory();
      const p = prepare(derive, api, code, lang);
      setPrepared(p);
      p.translate.catch(() => {}).then(() => setPrepared(cur => (cur === p ? { ...cur, done: true } : cur)));
    } catch (e) {
      setReview(null);
      setError(e instanceof TypeError ? "Couldn’t reach the review API. Start the backend and try again." : e.message);
    } finally {
      setLoading(false);
    }
  }

  // Flowchart and translation: same errors and same quota as a review. Resolves to the parsed answer, or throws a message.
  async function derive(call) {
    try {
      const r = await call();
      const data = await r.json().catch(() => ({}));
      if (data.detail === "daily_limit_reached") setUsage(u => u && { ...u, left: 0 });
      if (!r.ok)
        throw Error(
          ERRORS[data.detail] ||
            (r.status >= 500 ? "The API is unavailable. Try again." : `Request failed (HTTP ${r.status}).`),
        );
      if (typeof data.reviews_left === "number") setUsage(u => u && { ...u, left: data.reviews_left });
      return data;
    } catch (e) {
      throw e instanceof TypeError ? Error("Couldn’t reach the API. Start the backend and try again.") : e;
    }
  }

  async function openPast(id, place = load) {
    try {
      const r = await api.openReview(id);
      if (!r.ok) throw Error();
      const past = await r.json();
      place(past.code, past.filename, past.language);
      setReview({
        notes: toNotes(past.findings),
        ...(await checkRewrite(past.code, past.improved_code, past.language)),
        code: past.code,
      });
      scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Couldn’t open that review. Try again.");
    }
  }

  // The card goes at once; if the server refuses, the list is reloaded so it comes back.
  async function deletePast(past) {
    if (!confirm(`Delete the review of ${past.filename}?`)) return;
    setHistory(list => list.filter(x => x.id !== past.id));
    const r = await api.deleteReview(past.id).catch(() => null);
    if (!r?.ok && r?.status !== 404) {
      loadHistory();
      setError("Couldn’t delete that review. Try again.");
    }
  }

  return {
    languages,
    usage,
    history,
    review,
    loading,
    error,
    setError,
    guess,
    prepared,
    load,
    restore,
    run,
    derive,
    openPast,
    deletePast,
  };
}
