import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bug, Flame, KeyRound, PenLine, Sparkles } from "lucide-react";
import { Masthead } from "./shell.jsx";
import "./pages.css";

const LANGS = ["Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#", "Go", "Rust", "PHP", "Ruby", "Kotlin"];

// Tiny highlighter for the illustrations: strings, keywords and the name being defined.
const KW = "import|def|if|is|None|return|for|let|var|const|function|void|char|int";
const TOKEN = new RegExp(`("[^"]*"|#include|\\b(?:${KW})\\b|(?<=\\b(?:def|function|void|int) )\\w+(?=\\())`);
const IS_KW = new RegExp(`^(?:#include|${KW})$`);
const hl = line => line.split(TOKEN).map((t, i) => [i % 2 === 0 ? "" : t[0] === "\"" ? "tok-string" : IS_KW.test(t) ? "tok-keyword" : "tok-definition", t]);

const HERO = {
  file: "auth.py", ext: "PY", lang: "Python",
  code: ["import requests", "", "API_KEY = \"demo-secret-123\"", "", "def get_user(user_id):", "    r = requests.get(URL + user_id)", "    return r.json()", "", "def average(xs):", "    return sum(xs) / len(xs)"],
  notes: [
    { line: 3, sev: "high", title: "Hardcoded secret", fix: "Use an env variable." },
    { line: 7, sev: "medium", title: "Unchecked response", fix: "Check r.status_code." },
    { line: 10, sev: "low", title: "Empty list", fix: "Guard len(xs) == 0." },
  ],
};

// Scripted reviews for the "Try it" section, so the demo works without the model.
const DEMOS = [
  {
    file: "login.py", ext: "PY", lang: "Python",
    code: ["import sqlite3", "", "def login(db, uid, pw):", "    q = f\"SELECT * FROM users WHERE id={uid}\"", "    row = db.execute(q).fetchone()", "", "    if row[2] == pw:", "        return True", "", "    print(\"bad login\", uid, pw)", "    return False"],
    notes: [
      { line: 4, sev: "critical", title: "SQL injection", fix: "Use ? placeholders." },
      { line: 7, sev: "high", title: "Plain-text password", fix: "Compare salted hashes." },
      { line: 10, sev: "medium", title: "Password in logs", fix: "Never log credentials." },
    ],
  },
  {
    file: "cart.js", ext: "JS", lang: "JavaScript",
    code: ["var discount = 0.1;", "", "function total(items) {", "  let sum = 0;", "  for (let i = 0; i <= items.length; i++) {", "    sum += items[i].price;", "  }", "  if (sum == \"0\") return null;", "  return sum - sum * discount;", "}"],
    notes: [
      { line: 1, sev: "low", title: "Global variable", fix: "Use const in a module." },
      { line: 5, sev: "high", title: "Off by one", fix: "Loop while i < length." },
      { line: 8, sev: "medium", title: "Loose equality", fix: "Use === and return 0." },
    ],
  },
  {
    file: "greet.c", ext: "C", lang: "C",
    code: ["#include <stdio.h>", "#include <string.h>", "", "void greet(const char *name) {", "    char buf[16];", "    strcpy(buf, name);", "    strcat(buf, \"!\");", "", "    printf(buf);", "}", "", "int main(int argc, char **argv) {", "    greet(argv[1]);", "}"],
    notes: [
      { line: 6, sev: "critical", title: "Buffer overflow", fix: "snprintf(buf, sizeof buf, …)" },
      { line: 9, sev: "high", title: "Format string bug", fix: "printf(\"%s\", buf)." },
      { line: 13, sev: "medium", title: "Missing argument", fix: "Check argc > 1 first." },
    ],
  },
];

const DRAFT = DEMOS[0].code;
const STRUCK = new Set([4, 5, 7, 10]);
const REVISED = ["import sqlite3", "", "def login(db, uid, pw):", "    q = \"SELECT * FROM users WHERE id = ?\"", "    row = db.execute(q, (uid,)).fetchone()", "", "    if row is None:", "        return False", "    return check_hash(row[2], pw)"];
const FRESH = new Set([4, 5, 7, 8, 9]);

const PIPE = [
  ["Hand it in", "Paste, type or drop a file and pick its language."],
  ["Checked first", "We make sure it’s valid code in that language, and suggest the right one if it isn’t."],
  ["Read line by line", "Our AI reviewer looks for bugs, security risks and messy corners."],
  ["Ranked", "Every finding gets a severity, from critical to low, so you know what to fix first."],
  ["Quality-checked", "Incomplete or malformed reviews are caught before they reach you."],
  ["Back in your margin", "Notes sit beside their lines, with a revised draft to compare."],
];

const MARKS = [
  { sev: "critical", Icon: Flame, title: "Critical", example: "SQL built from user input", text: "Problems an attacker could use today." },
  { sev: "high", Icon: KeyRound, title: "High", example: "Secrets committed in code", text: "Real bugs and security risks worth fixing before you ship." },
  { sev: "medium", Icon: Bug, title: "Medium", example: "Errors silently ignored", text: "Code that works until the day it doesn’t." },
  { sev: "low", Icon: Sparkles, title: "Low", example: "Unclear names, dead code", text: "Tidy-ups that make the next reader’s job easier." },
];

const wave = "M0 4 q2.5 -4 5 0" + " t5 0".repeat(14);
const penWave = "M2 5 q5 -5 10 0" + " t10 0".repeat(18);
const scrollTo = id => document.getElementById(id).scrollIntoView({ behavior: "smooth" });

const Code = ({ lines, cls }) => lines.map((line, i) =>
  <div key={i} className={cls?.(i + 1) || ""}><span className="ln">{i + 1}</span><span className="t">{hl(line).map(([c, t], j) => <span key={j} className={c}>{t}</span>)}</span></div>);

// A sheet of code with margin notes; `lag` delays the marking (in note steps).
function Sheet({ file, ext, lang, code, notes, lag = 0, children }) {
  const byLine = Object.fromEntries(notes.map((note, i) => [note.line, { ...note, n: i + 1 }]));
  return <div className="hs">
    <div className="hs-tab"><span className="ext">{ext}</span>{file}</div>
    <span className="hs-stamp">{lang}</span>
    <pre className="hs-code">{code.map((line, i) => {
      const note = byLine[i + 1];
      return <div key={i} className={note ? `m sev-${note.sev}` : ""} style={note && { "--d": note.n + lag }}>
        <span className="ln">{i + 1}</span><span className="t">{hl(line).map(([c, t], j) => <span key={j} className={c}>{t}</span>)}</span>
        {note && <i className="hs-badge">{note.n}</i>}
      </div>;
    })}</pre>
    <div className="hs-margin">
      {Object.values(byLine).map(note => <div key={note.n} className={`hs-note sev-${note.sev}`} style={{ "--d": note.n + lag, top: 18 + (note.line - 1) * 26 }}>
        <span className="hs-meta"><span className="num">{note.n}</span>{note.sev}</span>
        <b>{note.title}</b>
        <span>→ {note.fix}</span>
      </div>)}
    </div>
    {children}
  </div>;
}

function Demo() {
  const [pick, setPick] = useState(0);
  const [run, setRun] = useState(0);
  const demo = DEMOS[pick];
  return <div className="demo" data-reveal>
    <div className="demo-side">
      <p>Pick a file and hand it in. This is a scripted example of a real review, so it runs without the model.</p>
      <div className="demo-files">
        {DEMOS.map((d, i) => <button key={d.file} className={i === pick ? "on" : ""} aria-pressed={i === pick} onClick={() => { setPick(i); setRun(0); }}>
          <span className="ext">{d.ext}</span>{d.file}
        </button>)}
      </div>
      <button className="btn-ink" onClick={() => setRun(r => r + 1)}>{run ? "Mark it again" : "Mark it up"} <PenLine size={16} /></button>
      <p className="demo-tally" aria-live="polite">{run > 0 && <span key={run} style={{ "--d": demo.notes.length + 1 }}>
        {demo.notes.length} notes in the margin. <a href="#signup">Try your own code →</a>
      </span>}</p>
    </div>
    <div className="demo-paper">
      <Sheet key={`${pick}-${run}`} {...demo} notes={run ? demo.notes : []} lag={1}>
        {run > 0 && <span className="scan" aria-hidden="true" />}
      </Sheet>
    </div>
  </div>;
}

function Compare() {
  const [x, setX] = useState(50);
  return <div className="compare" data-reveal style={{ "--x": `${x}%` }}>
    <div className="cmp-layer after"><span className="cmp-label">Revised draft</span><pre className="hs-code"><Code lines={REVISED} cls={n => FRESH.has(n) && "fresh"} /></pre></div>
    <div className="cmp-layer before" aria-hidden="true"><span className="cmp-label">Your draft</span><pre className="hs-code"><Code lines={DRAFT} cls={n => STRUCK.has(n) && "struck"} /></pre></div>
    <input type="range" min="0" max="100" value={x} onChange={e => setX(+e.target.value)} aria-label="Slide between your draft and the revised draft" />
    <span className="cmp-handle" aria-hidden="true"><PenLine size={15} /></span>
  </div>;
}

export default function Landing() {
  // Reveal each [data-reveal] block once it scrolls into view; the CSS does the animating.
  const page = useRef(null);
  useEffect(() => {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -12% 0px" });
    page.current.querySelectorAll("[data-reveal]").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return <>
    <div className="scroll-ink" aria-hidden="true" />
    <Masthead>
      <button className="navlink" onClick={() => scrollTo("how")}>How it works</button>
      <button className="navlink" onClick={() => scrollTo("try")}>Try it</button>
      <button className="navlink" onClick={() => scrollTo("languages")}>Languages</button>
      <a className="navlink" href="#signin">Sign in</a>
      <a className="btn-ink small" href="#signup">Get started</a>
    </Masthead>

    <main className="landing" ref={page}>
      <section className="hero">
        <div>
          <span className="eyebrow">AI code review</span>
          <h1>Every program deserves a <em>second reader.</em></h1>
          <p>CodePilot reads your code the way a careful marker would. It flags bugs, security holes and messy corners in the margin, line by line, then hands you a revised draft.</p>
          <div className="cta">
            <a className="btn-ink" href="#signup">Start reviewing <ArrowRight size={16} /></a>
            <a className="textlink" href="#signin">I already have an account</a>
          </div>
          <div className="facts">
            <span><b>12</b>languages</span>
            <span><b>4</b>severity levels</span>
            <span><b>1</b>revised draft per review</span>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="back b2" /><div className="back b1" />
          <Sheet {...HERO}>
            <svg className="hs-tick" viewBox="0 0 120 90"><path d="M8 52 L44 80 L112 8" /></svg>
          </Sheet>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-head" data-reveal><span>I.</span><h2>How it works</h2></div>
        <div className="steps">
          <article className="step" data-reveal style={{ "--i": 0 }}>
            <div className="mini write"><i className="w7" /><i className="w5" /><i className="w8" /><i className="w4 caret-line"><em className="caret" /></i></div>
            <span className="step-num">i.</span>
            <h3>Write or paste</h3>
            <p>Type into a real code editor, paste a snippet, or drop a file onto the sheet.</p>
          </article>
          <article className="step" data-reveal style={{ "--i": 1 }}>
            <div className="mini marked"><i className="w7" /><i className="w8 flagged"><svg viewBox="0 0 75 6"><path d={wave} /></svg></i><i className="w5" /><span className="mini-note"><b>1</b>Hardcoded secret</span></div>
            <span className="step-num">ii.</span>
            <h3>Get it marked</h3>
            <p>Notes land in the margin beside the exact lines they’re about, ranked from critical to low.</p>
          </article>
          <article className="step" data-reveal style={{ "--i": 2 }}>
            <div className="mini revise"><div><i className="w8 struck" /><i className="w6" /><i className="w7 struck" /></div><div><i className="w8 fresh" /><i className="w6" /><i className="w7 fresh" /></div></div>
            <span className="step-num">iii.</span>
            <h3>Read the revision</h3>
            <p>Compare your code with the reviewer’s revised draft, then copy it or keep yours.</p>
          </article>
        </div>
      </section>

      <section className="section" id="try">
        <div className="section-head" data-reveal><span>II.</span><h2>Try it on a sample</h2></div>
        <Demo />
      </section>

      <section className="section">
        <div className="section-head" data-reveal><span>III.</span><h2>What gets marked</h2></div>
        <div className="marks-grid">
          {MARKS.map(({ sev, Icon, title, example, text }, i) => <article key={sev} className={`mark-card sev-${sev}`} data-reveal style={{ "--i": i }}>
            <span className="ring"><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="27" /></svg><Icon size={22} /></span>
            <h3>{title}</h3>
            <p className="example">“{example}”</p>
            <p>{text}</p>
          </article>)}
        </div>
      </section>

      <section className="section">
        <div className="section-head" data-reveal><span>IV.</span><h2>Then the revised draft</h2></div>
        <div className="rev-wrap">
          <Compare />
          <div className="rev-list" data-reveal>
            <p>Drag the pen across <code>login.py</code> to see what the reviewer changed.</p>
            <ul>
              <li><b>4–5</b>A ? placeholder instead of pasting uid into the SQL.</li>
              <li><b>7–8</b>A missing user returns False instead of crashing.</li>
              <li><b>9</b>Hashes are compared, and the password is never logged.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head" data-reveal><span>V.</span><h2>What happens to your code</h2></div>
        <div className="pipe" data-reveal>
          <ol>{PIPE.map(([title, text], i) => <li key={title} style={{ "--i": i }}><span className="pipe-num">{i + 1}</span><b>{title}</b><p>{text}</p></li>)}</ol>
          <span className="pipe-dot" aria-hidden="true" />
        </div>
      </section>

      <section className="section" id="languages">
        <div className="section-head" data-reveal><span>VI.</span><h2>Twelve languages, one red pen</h2></div>
        <div className="lang-wall" data-reveal>{LANGS.map((l, i) => <span key={l} style={{ "--i": i }}>{l}</span>)}</div>
      </section>

      <section className="closing" data-reveal>
        <h2>Hand in your <em>first file.<svg className="pen-wave" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true"><path d={penWave} pathLength="1" /></svg></em></h2>
        <div className="cta">
          <a className="btn-paper" href="#signup">Start reviewing <ArrowRight size={16} /></a>
          <a className="textlink on-ink" href="#signin">Sign in</a>
        </div>
      </section>
    </main>
  </>;
}
