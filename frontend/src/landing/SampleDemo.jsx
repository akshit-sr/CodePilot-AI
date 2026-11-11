// "Try it on a sample": pick one of three files and watch a scripted review mark it up in the margin.
// The sheet's look and its animations come from the .hs and .demo rules in pages.css.
import { useEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { DEMOS } from "./content.js";
import { CodeLine } from "./CodeLines.jsx";

const LINE_HEIGHT = 26;
const FIRST_LINE_TOP = 18;
// Notes appear one after another; this many steps pass before the first, leaving time for the scan line.
const NOTE_DELAY_STEPS = 1;

// A sheet of code with numbered notes in its margin. Pass no notes for a clean sheet.
function MarkedSheet({ file, ext, lang, code, notes, children }) {
  const numbered = notes.map((note, i) => ({ ...note, number: i + 1 }));
  const noteOnLine = Object.fromEntries(numbered.map(note => [note.line, note]));
  const delay = note => ({ "--d": note.number + NOTE_DELAY_STEPS });

  return (
    <div className="hs">
      <div className="hs-tab">
        <span className="ext">{ext}</span>
        {file}
      </div>
      <span className="hs-stamp">{lang}</span>

      <pre className="hs-code">
        {code.map((line, i) => {
          const note = noteOnLine[i + 1];
          return (
            <div key={i} className={note ? `m sev-${note.sev}` : ""} style={note && delay(note)}>
              <CodeLine number={i + 1} text={line} />
              {note && <i className="hs-badge">{note.number}</i>}
            </div>
          );
        })}
      </pre>

      <div className="hs-margin">
        {numbered.map(note => {
          const top = FIRST_LINE_TOP + (note.line - 1) * LINE_HEIGHT;
          return (
            <div key={note.number} className={`hs-note sev-${note.sev}`} style={{ ...delay(note), top }}>
              <span className="hs-meta">
                <span className="num">{note.number}</span>
                {note.sev}
              </span>
              <b>{note.title}</b>
              <span>{note.fix}</span>
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}

export function SampleDemo() {
  const [picked, setPicked] = useState(0);
  // How many times the current file has been marked. 0 means the sheet is still clean.
  const [runs, setRuns] = useState(0);
  const paper = useRef(null);
  const demo = DEMOS[picked];

  // Mark the first sample without being asked, once the sheet has scrolled into view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setRuns(1);
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(paper.current);
    return () => observer.disconnect();
  }, []);

  const pick = index => {
    setPicked(index);
    setRuns(0);
  };

  return (
    <div className="demo">
      <div className="demo-side">
        <p>Pick a file and hand it in. These are scripted examples of real reviews, so they run without the model.</p>
        <div className="demo-files">
          {DEMOS.map((d, i) => (
            <button
              key={d.file}
              className={i === picked ? "on" : ""}
              aria-pressed={i === picked}
              onClick={() => pick(i)}
            >
              <span className="ext">{d.ext}</span>
              {d.file}
            </button>
          ))}
        </div>
        <button className="lp-btn" onClick={() => setRuns(runs + 1)}>
          {runs ? "Mark it again" : "Mark it up"} <PenLine size={16} />
        </button>
        <p className="demo-tally" aria-live="polite">
          {runs > 0 && (
            <span key={runs} style={{ "--d": demo.notes.length + 1 }}>
              {demo.notes.length} notes in the margin. <a href="#signup">Try your own code</a>
            </span>
          )}
        </p>
      </div>

      <div className="demo-paper" ref={paper}>
        {/* A new key remounts the sheet, which restarts its CSS animations. */}
        <MarkedSheet key={`${picked}-${runs}`} {...demo} notes={runs ? demo.notes : []}>
          {runs > 0 && <span className="scan" aria-hidden="true" />}
        </MarkedSheet>
      </div>
    </div>
  );
}
