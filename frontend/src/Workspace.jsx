import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Masthead } from "./shell.jsx";
import { SAMPLES } from "./samples.js";
import { EXT, FALLBACK_LANGUAGES, LEVELS, LIMIT, diffLines, download, languageFor } from "./review.js";
import { useDraft } from "./hooks/useDraft.js";
import { useReview } from "./hooks/useReview.js";
import { usePinnedNotes } from "./hooks/usePinnedNotes.js";
import { FileTab } from "./components/FileTab.jsx";
import { LanguagePicker } from "./components/LanguagePicker.jsx";
import { ViewToggle } from "./components/ViewToggle.jsx";
import { Tools } from "./components/Tools.jsx";
import { DiffView } from "./components/DiffView.jsx";
import { MarginStatus } from "./components/MarginStatus.jsx";
import { Note } from "./components/Note.jsx";
import { SheetFooter } from "./components/SheetFooter.jsx";
import { History } from "./components/History.jsx";
import { Flowchart } from "./components/Flowchart.jsx";
import { Translate } from "./components/Translate.jsx";

// CodeMirror is most of the bundle and only this page needs it.
const Editor = lazy(() => import("./Editor.jsx"));
const NO_NOTES = [];

export default function Workspace() {
  const { signOut } = useAuth();

  // How the review is being looked at; reset each time a review starts.
  const [filter, setFilter] = useState(null);   // severity being shown, or null for all
  const [active, setActive] = useState(null);   // note number under the pointer
  const [view, setView] = useState("code");     // "code" or "changes"
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [translating, setTranslating] = useState(false);   // translation pane open
  const [flowing, setFlowing] = useState(false);             // flowchart pop-up open

  const draft = useDraft();
  const { code, filename, language } = draft;
  const server = useReview(draft, () => { setFilter(null); setActive(null); setView("code"); });
  const { languages, online, usage, history, review, loading } = server;
  const reviewed = !!review;   // Flowchart and Translate appear once the file has been marked up
  // Open files: the current sheet lives in `draft` and `server`; the others wait here with their code and review.
  const [tabs, setTabs] = useState([{ id: 0 }]);
  const [cur, setCur] = useState(0);
  const lastId = useRef(0);
  const list = tabs.map(t => t.id === cur ? { id: cur, code, filename, language, review, prepared: server.prepared } : t);
  const resetView = () => { setFilter(null); setActive(null); setView("code"); setTranslating(false); setFlowing(false); };

  const prepared = server.prepared?.code === code && server.prepared.language === language ? server.prepared : null;

  const size = new Blob([code]).size;
  const stale = review && code !== review.code;   // edited since the review
  const notes = review ? review.notes.filter(n => !filter || n.severity === filter) : [];
  const counts = Object.fromEntries(LEVELS.map(l => [l, review ? review.notes.filter(n => n.severity === l).length : 0]));
  const hasRewrite = review?.improved && !loading;
  const shown = hasRewrite ? view : "code";
  const diff = useMemo(() => shown === "changes" ? diffLines(review.code, review.improved) : null, [shown, review]);

  const editorView = useRef(null), margin = useRef(null);
  usePinnedNotes(editorView, margin, shown === "code" && !(translating && reviewed));

  // Ctrl/⌘ + Enter reviews from anywhere on the page.
  useEffect(() => {
    const onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); server.run(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  // A new file gets its own tab, unless the current sheet is still empty.
  function open(text, name, lang) {
    if (!code.trim() && !review) return server.load(text, name, lang);
    const id = ++lastId.current;
    setTabs([...list, { id }]); setCur(id); resetView();
    server.load(text, name, lang);
  }

  function switchTo(id) {
    if (id === cur || loading) return;
    setTabs(list); setCur(id); resetView();
    server.restore(list.find(t => t.id === id));
  }

  function closeTab(id) {
    const t = list.find(t => t.id === id);
    if (loading || (t.code?.trim() && !t.review && !confirm(`Close ${t.filename}? It hasn’t been reviewed.`))) return;
    const rest = list.filter(x => x.id !== id);
    setTabs(rest);
    if (id !== cur) return;
    const next = rest[Math.min(list.indexOf(t), rest.length - 1)];
    setCur(next.id); resetView(); server.restore(next);
  }

  async function openFile(file) {
    if (file) open(await file.text(), file.name, languageFor(file.name) || language);
  }

  function showNoteLine(note) {
    setView("code");
    requestAnimationFrame(() => {
      const view = editorView.current, doc = view.state.doc;
      view.dispatch({ selection: { anchor: doc.line(Math.min(note.line, doc.lines)).from }, scrollIntoView: true });
      view.focus();
    });
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      server.setError("Clipboard access isn’t available in this browser.");
    }
  }

  const onlineLabel = online === true ? "API online" : online === false ? "API offline" : "Checking API";

  return <>
    <Masthead>
      <span className={"status " + (online === true ? "up" : online === false ? "down" : "")}><i />{onlineLabel}</span>
      {usage && <span className="quota">{usage.left} of {usage.limit} reviews left · resets {new Date(usage.resets_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
      <a className="navlink" href="#eval">Evaluate model</a>
      <a className="navlink" href="#" onClick={e => { e.preventDefault(); signOut({ redirectUrl: "/#" }); }}>Sign out</a>
    </Masthead>

    <main>
      <section className={"lede" + (code ? " compact" : "")}>
        <h1>Write it. <span>We’ll mark it.</span></h1>
        {!code && <p>Write or paste code in any of {Object.keys(languages).length} languages. The reviewer reads it and leaves
          notes in the margin about bugs, security problems and anything worth tidying.
        </p>}
      </section>

      <article
        className={"sheet" + (dragging ? " dragging" : "")}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); openFile(e.dataTransfer.files[0]); }}
      >
        <FileTab
          tabs={list}
          current={cur}
          onSwitch={switchTo}
          onClose={closeTab}
          onNew={() => open("", "untitled." + (Object.keys(EXT).find(e => EXT[e] === language) || "txt"), language)}
          onRename={draft.setFilename}
          onRenamed={() => languageFor(filename) && draft.setLanguage(languageFor(filename))}
        />

        <div className="sheet-head">
          <LanguagePicker languages={languages} language={language} onPick={draft.setLanguage} />
          {hasRewrite && <ViewToggle view={shown} onChange={setView} />}
          <Tools
            hasCode={!!code}
            reviewed={reviewed}
            preparing={!!prepared && !prepared.done}
            onAttach={openFile}
            onExample={() => open(SAMPLES[language][1], SAMPLES[language][0], language)}
            onDownload={() => download(filename, code, language)}
            onFlow={() => setFlowing(true)}
            onTranslate={() => setTranslating(t => !t)}
            onClear={() => server.load("", filename, language)}
          />
        </div>

        <div className={"page" + (shown !== "code" ? " alt" : "") + (translating && reviewed ? " split" : "")}>
          <Suspense>
            <Editor
              value={code}
              onChange={draft.setCode}
              languageName={languages[language] || FALLBACK_LANGUAGES[language]}
              notes={stale ? [] : notes}
              active={active}
              onRun={server.run}
              viewRef={editorView}
            />
          </Suspense>

          {diff && <DiffView
            rows={diff}
            copied={copied}
            onCopy={() => copy(review.improved)}
            onDownload={() => download(filename, review.improved, language)}
            onUse={() => server.load(review.improved, filename, language)}
          />}

          {translating && reviewed ? <Translate code={code} language={language} languages={languages} filename={filename} derive={server.derive} onOpen={open} onClose={() => setTranslating(false)} prepared={prepared} />
          : <aside className="margin" ref={margin} aria-live="polite">
            <div className="margin-head">
              <h2>Margin notes</h2>
              <MarginStatus
                loading={loading}
                error={server.error}
                guess={server.guess}
                languages={languages}
                review={review}
                stale={stale}
                filter={filter}
                shownCount={notes.length}
                filename={filename}
                canRetry={usage?.left !== 0}
                onSwitch={lang => { draft.setLanguage(lang); server.run(lang); }}
                onRetry={() => server.run()}
                onShowAll={() => setFilter(null)}
              />
            </div>
            {!loading && !stale && notes.map((note, i) =>
              <Note key={note.n} note={note} index={i} active={active === note.n} onHover={setActive} onOpen={showNoteLine} />
            )}
          </aside>}

          {dragging && <div className="drop">Drop the file to open it</div>}
        </div>

        {flowing && <Flowchart
          code={code}
          language={language}
          notes={review && !stale ? review.notes : NO_NOTES}
          marked={!!review && !stale}
          prepared={prepared}
          derive={server.derive}
          onReview={() => server.run()}
          onClose={() => setFlowing(false)}
        />}

        <SheetFooter
          counts={counts}
          filter={filter}
          onFilter={setFilter}
          showCounts={review && !stale}
          loading={loading}
          code={code}
          size={size}
          canRun={!loading && code.trim() && size <= LIMIT}
          reviewed={review && !stale}
          onRun={server.run}
        />
      </article>

      <History reviews={history} onOpen={id => server.openPast(id, open)} onDelete={server.deletePast} />
    </main>
  </>;
}
