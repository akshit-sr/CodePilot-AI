import { Suspense, lazy, useEffect, useState } from "react";
import { Check, Copy, Download, FilePlus, X } from "lucide-react";
import { useApi } from "../api.js";
import { download, renameFor } from "../review.js";

const Editor = lazy(() => import("../Editor.jsx"));

// Takes the margin's place beside your code: pick a language, translate, and read the result next to the original.
export function Translate({ code, language, languages, filename, prepared, derive, onOpen, onClose }) {
  const api = useApi();
  const [target, setTarget] = useState(prepared?.target ?? (language === "javascript" ? "python" : "javascript"));
  const [result, setResult] = useState(null); // { text, lang, from } where from is the code it was made from
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // The translation started after the review: show it as soon as it lands.
  useEffect(() => {
    if (!prepared) return;
    let live = true;
    setBusy(true);
    prepared.translate
      .then(d => live && setResult({ text: d.code, lang: d.language, from: code }))
      .catch(() => {})
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, []);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const data = await derive(() => api.translate({ code, language, target }));
      setResult({ text: data.code, lang: data.language, from: code });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard access isn’t available in this browser.");
    }
  }

  const name = result && renameFor(filename, result.lang);

  return (
    <aside className="margin translate" aria-live="polite">
      <div className="translate-bar">
        <label>
          Translate to
          <select value={target} onChange={e => setTarget(e.target.value)}>
            {Object.entries(languages).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="link" disabled={busy || !code.trim()} onClick={run}>
          {busy ? "Translating…" : result ? "Translate again" : "Translate"}
        </button>
        <button className="link close" aria-label="Close translation" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {error && <p className="hint">{error}</p>}
      {result && (
        <>
          {result.from !== code && <p className="hint">You’ve edited the code since this translation.</p>}
          <Suspense>
            <Editor value={result.text} languageName={languages[result.lang]} readOnly />
          </Suspense>
          <div className="translate-actions">
            <button className="link" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
            <button className="link" onClick={() => download(name, result.text, result.lang)}>
              <Download size={14} /> Download
            </button>
            <button className="link" onClick={() => onOpen(result.text, name, result.lang)}>
              <FilePlus size={14} /> Open as new file
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
