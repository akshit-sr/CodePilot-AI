import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/react";
import { BookOpen, Check, Copy, Eraser, Paperclip, PenLine } from "lucide-react";
import Landing from "./Landing.jsx";
import Auth from "./Auth.jsx";
import { Masthead, stored, store } from "./shell.jsx";
import { SAMPLES } from "./samples.js";
import { syntaxChecker } from "./syntax.js";
import parserRuntime from "web-tree-sitter/web-tree-sitter.wasm?url";
import "./styles.css";

// CodeMirror is most of the bundle and only the workspace needs it.
const Editor = lazy(() => import("./Editor.jsx"));

const FALLBACK_LANGUAGES = { python: "Python", javascript: "JavaScript", typescript: "TypeScript", java: "Java", c: "C", cpp: "C++", csharp: "C#", go: "Go", rust: "Rust", php: "PHP", ruby: "Ruby", kotlin: "Kotlin" };
const EXT = { py: "python", js: "javascript", mjs: "javascript", ts: "typescript", java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", go: "go", rs: "rust", php: "php", rb: "ruby", kt: "kotlin" };
const ERRORS = {
  unsupported_language: "That language isn’t supported yet.",
  code_too_large: "This file is over the 100 KB limit.",
  model_unavailable: "The review model is unavailable. Check that the model service is running.",
  model_timeout: "The model took too long to answer. Try again in a moment.",
  malformed_model_output: "The model returned an unreadable review. Try again.",
  sign_in_required: "Your session has expired. Sign out and sign in again.",
  daily_limit_reached: "You’ve used all of today’s reviews. The count resets at midnight UTC.",
  database_unavailable: "The review service can’t reach its database. Try again in a moment.",
};
const ABBR = { python: "PY", javascript: "JS", typescript: "TS", java: "JAVA", c: "C", cpp: "C++", csharp: "C#", go: "GO", rust: "RS", php: "PHP", ruby: "RB", kotlin: "KT" };
const LEVELS = ["critical", "high", "medium", "low"];
const LIMIT = 100_000;
const syntax = syntaxChecker(lang => `/grammars/${lang}.wasm`, parserRuntime);
const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

const humanize = type => (type || "finding").replace(/[_-]+/g, " ").replace(/^./, c => c.toUpperCase());
const languageFor = name => EXT[name.split(".").pop().toLowerCase()];

function toNotes(findings) {
  return findings
    .map(f => ({ ...f, line: Math.max(1, parseInt(f.line) || 1), severity: LEVELS.includes(String(f.severity).toLowerCase()) ? String(f.severity).toLowerCase() : "low" }))
    .sort((a, b) => a.line - b.line || LEVELS.indexOf(a.severity) - LEVELS.indexOf(b.severity))
    .map((f, i) => ({ ...f, n: i + 1 }));
}

// Line diff for the Changes view: rows of [op, text, line number], op " " kept, "-" yours, "+" the reviewer's.
// ponytail: O(n·m) LCS on the changed middle only; switch to Myers if huge rewrites get slow.
function diffLines(before, after) {
  const a = before.replace(/\r\n/g, "\n").trimEnd().split("\n"), b = after.replace(/\r\n/g, "\n").trimEnd().split("\n");
  let s = 0, e = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e), B = b.slice(s, b.length - e);
  const L = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const rows = a.slice(0, s).map((t, k) => [" ", t, k + 1]);
  let i = 0, j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) { rows.push([" ", A[i], s + j + 1]); i++; j++; }
    else if (i < A.length && (j === B.length || L[i + 1][j] >= L[i][j + 1])) { rows.push(["-", A[i], s + i + 1]); i++; }
    else { rows.push(["+", B[j], s + j + 1]); j++; }
  }
  return rows.concat(b.slice(b.length - e).map((t, k) => [" ", t, b.length - e + k + 1]));
}

function Workspace() {
  const { getToken, signOut } = useAuth();
  const api = async (path, init = {}) => fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await getToken()}` } });
  const [usage, setUsage] = useState(null), [history, setHistory] = useState([]); // { limit, left }, [{ id, filename, language, created_at }]
  const [code, setCode] = useState(() => stored("codepilot.code") ?? "");
  const [filename, setFilename] = useState(() => stored("codepilot.filename") || "untitled.py");
  const [language, setLanguage] = useState(() => stored("codepilot.language") || "python");
  const [langs, setLangs] = useState(FALLBACK_LANGUAGES);
  const [online, setOnline] = useState(null);
  const [review, setReview] = useState(null); // { notes, improved, code }
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [guess, setGuess] = useState(null);
  const [filter, setFilter] = useState(null), [active, setActive] = useState(null);
  const [dragging, setDragging] = useState(false), [copied, setCopied] = useState(false), [view, setView] = useState("code");
  const viewRef = useRef(null), margin = useRef(null), upload = useRef(null), picker = useRef(null);

  const size = new Blob([code]).size, tooBig = size > LIMIT;
  const notes = review ? review.notes.filter(n => !filter || n.severity === filter) : [];
  const stale = review && code !== review.code;
  // After a review the sheet can show the changes in place of the editor.
  const drafted = review?.improved && !loading, shown = drafted ? view : "code";
  const changes = useMemo(() => shown === "changes" ? diffLines(review.code, review.improved) : null, [shown, review]);

  useEffect(() => {
    fetch("/languages").then(r => r.json()).then(setLangs).catch(() => {}); checkHealth();
    api("/usage").then(r => r.ok && r.json()).then(u => u && setUsage(u)).catch(() => {});
    loadHistory();
  }, []);
  useEffect(() => { store("codepilot.code", code); store("codepilot.filename", filename); store("codepilot.language", language); }, [code, filename, language]);
  useEffect(() => {
    const key = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); } };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  // Pin each margin note beside its line, pushing it down if the note above would overlap.
  const [, relayout] = useState(0);
  useEffect(() => { const r = () => relayout(x => x + 1); addEventListener("resize", r); return () => removeEventListener("resize", r); }, []);
  useLayoutEffect(() => {
    const view = viewRef.current, box = margin.current;
    if (!view || !box || shown !== "code") return;
    const base = view.documentTop - box.getBoundingClientRect().top;
    let floor = box.querySelector(".margin-head")?.offsetHeight || 0;
    for (const el of box.querySelectorAll(".note")) {
      const line = view.state.doc.line(Math.min(+el.dataset.line, view.state.doc.lines));
      const top = Math.max(base + view.lineBlockAt(line.from).top - 6, floor);
      el.style.top = top + "px";
      floor = top + el.offsetHeight + 12;
    }
    box.style.setProperty("--notes-height", floor + "px");
  });

  function placePicker(button) {
    const r = button.getBoundingClientRect();
    Object.assign(picker.current.style, { top: r.bottom + 10 + "px", left: Math.max(8, Math.min(r.left, innerWidth - 344)) + "px" });
  }

  function checkHealth() { fetch("/health").then(r => setOnline(r.ok)).catch(() => setOnline(false)); }
  function loadHistory() { api("/history").then(r => r.ok && r.json()).then(h => Array.isArray(h) && setHistory(h)).catch(() => {}); }

  async function openPast(id) {
    try {
      const r = await api(`/history/${id}`);
      if (!r.ok) throw Error();
      const past = await r.json();
      load(past.code, past.filename, past.language);
      setReview({ notes: toNotes(past.findings), improved: past.improved_code, code: past.code });
      scrollTo({ top: 0, behavior: "smooth" });
    } catch { setError("Couldn’t open that review. Try again."); }
  }

  async function run(lang = language) {
    if (!code.trim() || tooBig || loading) return;
    setLoading(true); setError(""); setGuess(null); setFilter(null); setActive(null); setView("code");
    try {
      // A grammar that fails to load just skips the check; the reviewer still runs.
      if (await syntax.hasError(code, lang).catch(() => false)) {
        setGuess(await syntax.detect(code, lang).catch(() => null));
        throw Error(`This doesn’t parse as ${langs[lang]}. Check the Language setting, or fix the syntax error.`);
      }
      const r = await api("/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, language: lang, filename }) });
      const data = await r.json().catch(() => ({}));
      if (data.detail === "daily_limit_reached") setUsage(u => u && { ...u, left: 0 });
      if (!r.ok) throw Error(ERRORS[data.detail] || (r.status >= 500 ? "The review API is unavailable. Start the backend and try again." : `Review failed (HTTP ${r.status}).`));
      setReview({ notes: toNotes(Array.isArray(data.findings) ? data.findings : []), improved: data.improved_code || null, code });
      if (typeof data.reviews_left === "number") setUsage(u => u && { ...u, left: data.reviews_left });
      loadHistory();
    } catch (e) {
      setReview(null);
      setError(e instanceof TypeError ? "Couldn’t reach the review API. Start the backend and try again." : e.message);
    } finally {
      setLoading(false); checkHealth();
    }
  }

  async function openFile(file) {
    if (!file) return;
    setFilename(file.name);
    if (languageFor(file.name)) setLanguage(languageFor(file.name));
    setCode(await file.text()); setReview(null); setError("");
  }

  function load(text, name, lang) { setCode(text); setFilename(name); setLanguage(lang); setReview(null); setError(""); }

  function goTo(note) {
    const view = viewRef.current, line = view.state.doc.line(Math.min(note.line, view.state.doc.lines));
    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    view.focus();
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Clipboard access isn’t available in this browser."); }
  }

  const counts = Object.fromEntries(LEVELS.map(l => [l, review ? review.notes.filter(n => n.severity === l).length : 0]));

  return <>
    <Masthead>
      <span className={"status " + (online === true ? "up" : online === false ? "down" : "")}><i />{online === true ? "API online" : online === false ? "API offline" : "Checking API"}</span>
      {usage && <span className="quota">{usage.left} of {usage.limit} reviews left today</span>}
      <a className="navlink" href="#" onClick={e => { e.preventDefault(); signOut({ redirectUrl: "/#" }); }}>Sign out</a>
    </Masthead>

    <main>
      <section className="lede">
        <h1>Write it. <span>We’ll mark it.</span></h1>
        <p>Write or paste code in any of {Object.keys(langs).length} languages. The reviewer reads it and leaves notes in the margin about bugs, security problems and anything worth tidying.</p>
      </section>

      <article className={"sheet" + (dragging ? " dragging" : "")}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); openFile(e.dataTransfer.files[0]); }}>

        <div className="file-tab">
          <span className="ext">{ABBR[language] || "TXT"}</span>
          <input className="filename" value={filename} size={Math.max(8, filename.length)} spellCheck="false" aria-label="File name"
            onChange={e => setFilename(e.target.value)} onBlur={() => languageFor(filename) && setLanguage(languageFor(filename))} />
          <PenLine size={13} aria-hidden="true" />
        </div>

        <div className="sheet-head">
          <span className="written-in">written in</span>
          <button key={language} className="stamp" popoverTarget="lang-picker" onClick={e => placePicker(e.currentTarget)} aria-label={`Language: ${langs[language]}. Change language`}>{langs[language]}</button>
          <div id="lang-picker" popover="auto" className="lang-picker" ref={picker}>
            <p>Which language is this?</p>
            <div className="lang-grid">
              {Object.entries(langs).map(([id, name]) => <button key={id} className={id === language ? "on" : ""} aria-pressed={id === language} onClick={() => { setLanguage(id); picker.current.hidePopover(); }}>{name}</button>)}
            </div>
          </div>
          {drafted && <div className="view-toggle" role="group" aria-label="Show on the sheet">
            {[["code", "Your code"], ["changes", "Changes"]].map(([v, label]) => <button key={v} className={shown === v ? "on" : ""} aria-pressed={shown === v} onClick={() => setView(v)}>{label}</button>)}
          </div>}
          <div className="tools">
            <button className="tool" onClick={() => upload.current.click()}><Paperclip size={15} />Attach file</button>
            <button className="tool" onClick={() => load(SAMPLES[language][1], SAMPLES[language][0], language)}><BookOpen size={15} />Example</button>
            {code && <button className="tool" onClick={() => load("", filename, language)}><Eraser size={15} />Fresh sheet</button>}
            <input ref={upload} hidden type="file" accept={Object.keys(EXT).map(e => "." + e).join(",") + ",.txt"} onChange={e => { openFile(e.target.files[0]); e.target.value = ""; }} />
          </div>
        </div>

        <div className={"page" + (shown !== "code" ? " alt" : "")}>
          <Suspense><Editor value={code} onChange={setCode} languageName={langs[language] || FALLBACK_LANGUAGES[language]} notes={stale ? [] : notes} active={active} onRun={run} viewRef={viewRef} /></Suspense>
          {changes && <div className="draft-view">
            <div className="draft-bar">
              <p><span className="del-key">struck</span> lines are yours, <span className="add-key">green</span> lines are the reviewer’s fix.</p>
              <button className="link" onClick={() => copy(review.improved)}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button>
              <button className="link" onClick={() => load(review.improved, filename, language)}>Use this version</button>
            </div>
            <pre className="diff">{changes.map(([op, text, n], i) =>
              <div key={i} className={op === "+" ? "add" : op === "-" ? "del" : ""}><span className="dn">{n}</span><span className="op">{op}</span><span className="t">{text}</span></div>)}</pre>
          </div>}
          <aside className="margin" ref={margin} aria-live="polite">
            <div className="margin-head">
              <h2>Margin notes</h2>
              {loading && <p className="reading">Reading your code<span className="pen" /></p>}
              {!loading && error && <div className="slip error"><b>The review didn’t finish.</b><p>{error}</p>{guess ? <button className="link" onClick={() => { setLanguage(guess); run(guess); }}>It looks like {langs[guess]}. Switch and review</button> : usage?.left !== 0 && <button className="link" onClick={() => run()}>Try again</button>}</div>}
              {!loading && !error && !review && <p className="hint">Notes appear here, next to the lines they refer to. Press <kbd>{MOD}</kbd> <kbd>↵</kbd> or <b>Mark it up</b> when you’re ready.</p>}
              {!loading && !error && review && review.notes.length === 0 && <div className="slip clean"><span className="big-tick">✓</span><b>No marks.</b><p>The reviewer found nothing to fix in {filename}.</p></div>}
              {!loading && stale && review.notes.length > 0 && <div className="slip stale">You’ve edited the code since this review, so notes may point at the wrong lines. <button className="link" onClick={() => run()}>Review again</button></div>}
              {!loading && review && filter && notes.length === 0 && <p className="hint">No {filter} notes. <button className="link" onClick={() => setFilter(null)}>Show all</button></p>}
            </div>
            {!loading && !stale && notes.map((note, i) =>
              <button key={note.n} data-line={note.line} style={{ "--d": i }} className={`note sev-${note.severity}` + (active === note.n ? " is-active" : "")}
                onMouseEnter={() => setActive(note.n)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(note.n)} onBlur={() => setActive(null)} onClick={() => { setView("code"); requestAnimationFrame(() => goTo(note)); }}>
                <span className="note-meta"><span className="num">{note.n}</span>{note.severity}<span className="where">line {note.line}</span></span>
                <b>{humanize(note.type)}</b>
                <span className="explain">{note.explanation}</span>
                {note.suggested_fix && <span className="fix">→ {note.suggested_fix}</span>}
              </button>)}
          </aside>
          {dragging && <div className="drop">Drop the file to open it</div>}
        </div>

        <footer className="sheet-foot">
          {review && !stale
            ? <div className="marks" role="group" aria-label="Filter notes by severity">
                {LEVELS.map(l => <button key={l} className={`mark sev-${l}` + (filter === l ? " on" : "")} disabled={!counts[l]} onClick={() => setFilter(filter === l ? null : l)} aria-pressed={filter === l}>
                  <b>{counts[l]}</b>{l}</button>)}
              </div>
            : <p className="unmarked">{loading ? "Marking…" : "Not marked yet."}</p>}
          <div className={"gauge" + (tooBig ? " over" : "")}>
            <span>{code ? code.split("\n").length : 0} lines</span>
            <i style={{ "--fill": Math.min(1, size / LIMIT) }} aria-hidden="true" />
            <span>{(size / 1000).toFixed(1)} / 100 KB</span>
          </div>
          <button className="primary" onClick={() => run()} disabled={loading || !code.trim() || tooBig}>{loading ? "Reading…" : review && !stale ? "Mark it up again" : "Mark it up"}<span className="keys">{MOD} ↵</span></button>
        </footer>
      </article>

      {history.length > 0 && <section className="past">
        <h2>Earlier sheets</h2>
        <ul>{history.map(h => <li key={h.id}><button onClick={() => openPast(h.id)}>
          <span className="ext">{ABBR[h.language] || "TXT"}</span><b>{h.filename}</b>
          <time dateTime={h.created_at}>{new Date(h.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
        </button></li>)}</ul>
      </section>}
    </main>

  </>;
}

// Hash routes (#review, #signin, #signup), so the server only ever has to serve "/". No slash after "#":
// "#/…" belongs to Clerk's form steps (#/factor-one, #/verify…), which keep the open form on screen.
function Root() {
  const [route, setRoute] = useState(location.hash);
  const { isLoaded, isSignedIn } = useAuth();
  const form = useRef(null);
  useEffect(() => {
    const change = () => { setRoute(location.hash); scrollTo(0, 0); };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  if (route === "#review" && (isSignedIn || !isLoaded)) return isSignedIn ? <Workspace /> : null;
  form.current = route === "#signin" || route === "#signup" ? route.slice(1) : route === "#review" ? "signin" : route.startsWith("#/") ? form.current : null;
  return form.current ? <Auth key={form.current} mode={form.current} /> : <Landing />;
}

// Clerk's redirects only ever change the hash here; without a router it waits for a page load that never comes.
const goTo = replace => to => { const { hash } = new URL(to, location.href); replace ? location.replace(hash || "#") : location.hash = hash; };

const root = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<React.StrictMode>
  <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/#" routerPush={goTo(false)} routerReplace={goTo(true)}><Root /></ClerkProvider>
</React.StrictMode>);
