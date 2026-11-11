// The opening scene. One file of code lies on the cutting mat. As the reader scrolls, it lifts into four layers,
// one per stage of a review, and then settles back down as the rewritten file.
//
// The section is several screens tall and its inner frame is pinned, so scrolling moves through the scene instead of
// past it. This component only turns scroll position into a few CSS variables; landing.css does all the drawing.
import { useEffect, useRef, useState } from "react";
import { SAMPLE, STAGES } from "./content.js";
import { CodeLines } from "./CodeLines.jsx";

// Sheet geometry in pixels. These match the .ply rules in landing.css.
const LINE_HEIGHT = 26;
const SHEET_PADDING = 22;
const LAYER_GAP = 150;

// Where in the scroll (0 = top of the section, 1 = bottom) each part of the scene happens.
const LIFT = [0.06, 0.26]; // the sheet separates into layers
const SETTLE = [0.88, 1]; // the layers close and the sheet turns to face the reader
const STAGE_STARTS = [0.26, 0.42, 0.58, 0.74, 0.9]; // stages 1 to 4, then the ending

// How quickly the scene catches up with the scroll position, in milliseconds. Easing towards the target on every
// animation frame is what keeps the motion even on a 120 Hz screen while the wheel moves the page in steps.
const CATCH_UP_MS = 90;

// How far above the "Ranked" layer each flag stands, in pixels. Staggered so the three cards never overlap.
const FLAG_HEIGHTS = [170, 84, 30];

const clamp01 = x => Math.min(1, Math.max(0, x));
const progressBetween = (p, [from, to]) => clamp01((p - from) / (to - from));
const smoothstep = t => t * t * (3 - 2 * t);
const mix = (from, to, t) => from + (to - from) * t;

// 0 while the opening headline shows, 1 to 4 for the stages, 5 for the ending.
const stageAt = progress => STAGE_STARTS.filter(start => progress >= start).length;

const lineTop = line => SHEET_PADDING + (line - 1) * LINE_HEIGHT;
const indentOf = text => text.length - text.trimStart().length;

// Writes the scene's state for one frame. `view` holds the eased scroll progress and mouse position.
function paint(frame, view) {
  const lift = smoothstep(progressBetween(view.progress, LIFT));
  const settle = smoothstep(progressBetween(view.progress, SETTLE));
  const mouseSway = 1 - settle; // the finished sheet holds still

  const tilt = mix(mix(44, 60, lift), 0, settle) + view.mouseY * 3 * mouseSway;
  const turn = mix(mix(-22, -38, lift), 0, settle) + view.mouseX * 5 * mouseSway;
  const gap = LAYER_GAP * lift * (1 - settle);
  // Lifted layers rise up the screen, so the whole rig moves down by half the stack's height to stay centred.
  const drop = gap * 1.5 * Math.sin((tilt * Math.PI) / 180);

  const set = (name, value) => frame.style.setProperty(name, value);
  set("--lift", lift.toFixed(4));
  set("--settle", settle.toFixed(4));
  set("--tilt", `${tilt.toFixed(3)}deg`);
  set("--turn", `${turn.toFixed(3)}deg`);
  set("--gap", `${gap.toFixed(2)}px`);
  set("--drop", `${drop.toFixed(2)}px`);
}

// Follows the scroll position and the mouse, easing towards them, and reports which stage is showing.
function useScrollScene(sectionRef, enabled) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const section = sectionRef.current;
    const frame = section.firstElementChild;
    const target = { progress: 0, mouseX: 0, mouseY: 0 };
    const view = { progress: 0, mouseX: 0, mouseY: 0 };
    let request = 0;
    let lastTime = 0;

    const tick = now => {
      const blend = 1 - Math.exp(-Math.min(now - lastTime, 50) / CATCH_UP_MS);
      lastTime = now;
      let moving = false;
      for (const key in view) {
        const distance = target[key] - view[key];
        if (Math.abs(distance) > 0.0004) {
          view[key] += distance * blend;
          moving = true;
        } else {
          view[key] = target[key];
        }
      }
      paint(frame, view);
      setStage(stageAt(view.progress));
      request = moving ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (request) return;
      lastTime = performance.now();
      request = requestAnimationFrame(tick);
    };

    const readScroll = () => {
      const box = section.getBoundingClientRect();
      target.progress = clamp01(-box.top / (box.height - innerHeight));
      wake();
    };
    const readMouse = event => {
      target.mouseX = event.clientX / innerWidth - 0.5;
      target.mouseY = event.clientY / innerHeight - 0.5;
      wake();
    };

    // Start where the page already is, so a reload half-way down does not replay the scene from the top.
    readScroll();
    view.progress = target.progress;

    addEventListener("scroll", readScroll, { passive: true });
    addEventListener("resize", readScroll);
    const hasMouse = matchMedia("(hover: hover)").matches;
    if (hasMouse) addEventListener("pointermove", readMouse, { passive: true });
    return () => {
      removeEventListener("scroll", readScroll);
      removeEventListener("resize", readScroll);
      removeEventListener("pointermove", readMouse);
      cancelAnimationFrame(request);
    };
  }, [sectionRef, enabled]);

  return stage;
}

// The headline and the calls to action, shown before the sheet lifts. The second line is split into letters so
// they can drift apart as the scene starts; screen readers get the whole sentence from the label.
function Opening() {
  return (
    <div className="opening">
      <h1 aria-label="Your code, taken apart.">
        Your code,{" "}
        <em aria-hidden="true">
          {[..."taken apart."].map((letter, i) => (
            <span key={i} style={{ "--i": i }}>
              {letter}
            </span>
          ))}
        </em>
      </h1>
      <p>Paste a file. CodePilot checks it, reads every line, ranks each problem and hands back a fixed version.</p>
      <div className="actions">
        <a className="lp-btn" href="#signup">
          Review my code
        </a>
        <a className="lp-link" href="#signin">
          Sign in
        </a>
      </div>
    </div>
  );
}

// The words beside the scene: one entry per stage, then the ending. CSS shows the entry matching data-step.
function StageCaptions() {
  return (
    <ol className="stages">
      {STAGES.map((stage, i) => (
        <li key={stage.name} className={`s${i + 1}`}>
          <span className="count">
            {i + 1} of {STAGES.length}
          </span>
          <h2>{stage.title}</h2>
          <p>{stage.text}</p>
        </li>
      ))}
      <li className="s5">
        <h2>Three found, three fixed.</h2>
        <p>That was a scripted example. Yours takes one paste.</p>
        <a className="lp-btn" href="#signup">
          Review my code
        </a>
      </li>
    </ol>
  );
}

// The 3D part: the mat, the four layers, the flags and the layer names. Purely decorative, so hidden from readers.
function Rig() {
  const { code, problems, rewrite, addedLines } = SAMPLE;
  const lineEnd = problem => code[problem.line - 1].length;

  return (
    <div className="rig-wrap" aria-hidden="true">
      <div className="rig">
        <div className="mat" />
        <div className="cast" />

        {/* 1. Parsed: the file itself, with a box around every token */}
        <pre className="ply p1">
          <CodeLines lines={code} boxTokens />
          <i className="okay">valid file</i>
        </pre>

        {/* 2. Read: a clear film with highlighter over the suspect lines */}
        <pre className="ply p2 film">
          {problems.map((problem, i) => {
            const indent = indentOf(code[problem.line - 1]);
            const style = {
              top: lineTop(problem.line) + 3,
              left: `calc(44px + ${indent}ch)`,
              width: `${lineEnd(problem) - indent}ch`,
              "--i": i,
            };
            return <i key={problem.line} className={`swipe sev-${problem.sev}`} style={style} />;
          })}
          <CodeLines lines={code} />
        </pre>

        {/* 3. Ranked: a numbered pin at the end of each suspect line */}
        <div className="ply p3 film">
          {problems.map((problem, i) => {
            const style = { top: lineTop(problem.line) + 4, left: `calc(52px + ${lineEnd(problem)}ch)`, "--i": i };
            return (
              <i key={problem.line} className={`dot sev-${problem.sev}`} style={style}>
                {i + 1}
              </i>
            );
          })}
        </div>

        {/* 4. Rewritten: the fixed file, stamped once the scene ends */}
        <pre className="ply p4">
          <CodeLines lines={rewrite} lineClass={n => addedLines.has(n) && "fresh"} />
          <b className="seal">3 of 3 fixed</b>
        </pre>

        {/* Flags stand on the pins. They sit outside the layer so they can turn to face the reader. */}
        {problems.map((problem, i) => {
          const style = {
            top: lineTop(problem.line) + 13,
            left: `calc(60px + ${lineEnd(problem)}ch)`,
            "--h": `${FLAG_HEIGHTS[i]}px`,
            "--i": i,
          };
          const side = i === 1 ? " left" : ""; // the middle card opens to the left to stay clear of the others
          return (
            <div key={problem.line} className={`flag sev-${problem.sev}${side}`} style={style}>
              <span className="sev">{problem.sev}</span>
              <b>{problem.title}</b>
              <span className="cure">{problem.fix}</span>
            </div>
          );
        })}

        {STAGES.map((stage, i) => (
          <span key={stage.name} className={`tag t${i + 1}`} style={{ "--z": i }}>
            <b>{i + 1}</b>
            {stage.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Bench() {
  const section = useRef(null);
  const [reducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const stage = useScrollScene(section, !reducedMotion);

  // With reduced motion nothing is pinned: the file is shown already taken apart, with every stage visible.
  return (
    <section className={"bench" + (reducedMotion ? " still" : "")} ref={section}>
      <div className="bench-pin" data-step={reducedMotion ? "all" : stage}>
        <Opening />
        <StageCaptions />
        <Rig />
      </div>
    </section>
  );
}
