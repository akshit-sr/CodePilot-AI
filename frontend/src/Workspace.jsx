import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Masthead } from "./shell.jsx";
import { SAMPLES } from "./samples.js";
import { FALLBACK_LANGUAGES, LEVELS, LIMIT, diffLines, languageFor } from "./review.js";
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

// CodeMirror is most of the bundle and only this page needs it.
const Editor = lazy(() => import("./Editor.jsx"));

export default function Workspace() {
  const { signOut } = useAuth();

  // How the review is being looked at; reset each time a review starts.
  const [filter, setFilter] = useState(null);   // severity being shown, or null for all
  const [active, setActive] = useState(null);   // note number under the pointer
  const [view, setView] = useState("code");     // "code" or "changes"
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const draft = useDraft();
  const { code, filename, language } = draft;
  const server = useReview(draft, () => { setFilter(null); setActive(null); setView("code"); });
  const { languages, online, usage, history, review, loading } = server;

  const size = new Blob([code]).size;
  const stale = review && code !== review.code;   // edited since the review
  const notes = review ? review.notes.filter(n => !filter || n.severity === filter) : [];
  const counts = Object.fromEntries(LEVELS.map(l => [l, review ? review.notes.filter(n => n.severity === l).length : 0]));
  const hasRewrite = review?.improved && !loading;
  const shown = hasRewrite ? view : "code";
  const diff = useMemo(() => shown === "changes" ? diffLines(review.code, review.improved) : null, [shown, review]);

  const editorView = useRef(null), margin = useRef(null);
  usePinnedNotes(editorView, margin, shown === "code");

  // Ctrl/⌘ + Enter reviews from anywhere on the page.
  useEffect(() => {
    const onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); server.run(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  async function openFile(file) {
    if (!file) return;
    server.load(await file.text(), file.name, languageFor(file.name) || language);
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
      <section className="lede">
        <h1>Write it. <span>We’ll mark it.</span></h1>
        <p>
          Write or paste code in any of {Object.keys(languages).length} languages. The reviewer reads it and leaves
          notes in the margin about bugs, security problems and anything worth tidying.
        </p>
      </section>

      <article
        className={"sheet" + (dragging ? " dragging" : "")}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); openFile(e.dataTransfer.files[0]); }}
      >
        <FileTab
          filename={filename}
          language={language}
          onRename={draft.setFilename}
          onRenamed={() => languageFor(filename) && draft.setLanguage(languageFor(filename))}
        />

        <div className="sheet-head">
          <LanguagePicker languages={languages} language={language} onPick={draft.setLanguage} />
          {hasRewrite && <ViewToggle view={shown} onChange={setView} />}
          <Tools
            hasCode={!!code}
            onAttach={openFile}
            onExample={() => server.load(SAMPLES[language][1], SAMPLES[language][0], language)}
            onClear={() => server.load("", filename, language)}
          />
        </div>

        <div className={"page" + (shown !== "code" ? " alt" : "")}>
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
            onUse={() => server.load(review.improved, filename, language)}
          />}

          <aside className="margin" ref={margin} aria-live="polite">
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
          </aside>

          {dragging && <div className="drop">Drop the file to open it</div>}
        </div>

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

      <History reviews={history} onOpen={server.openPast} onDelete={server.deletePast} />
    </main>
  </>;
}
