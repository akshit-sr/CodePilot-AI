// The landing page: the cutting-mat scene, a sample to try, the four ranks, the before/after slider, the languages
// and a last call to sign up. Styles are in landing.css; the sample sheet, slider and stamps reuse rules from pages.css.
import { useEffect, useRef } from "react";
import { Masthead } from "../shell.jsx";
import { FALLBACK_LANGUAGES } from "../review.js";
import { RANKS, REWRITE_NOTES } from "./content.js";
import { Bench } from "./Bench.jsx";
import { SampleDemo } from "./SampleDemo.jsx";
import { Compare } from "./Compare.jsx";
import "./landing.css";

// A wavy line, drawn as if by hand, for under the last headline.
const PEN_UNDERLINE = "M2 5 q5 -5 10 0" + " t10 0".repeat(18);

// Adds the class "in" to each matching element the first time it scrolls into view. The CSS animations that play
// once (stamps thumping in, the slider sweeping, the pen underlining) are all keyed off that class.
function useRevealOnScroll(pageRef, selector) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    pageRef.current.querySelectorAll(selector).forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [pageRef, selector]);
}

export default function Landing() {
  const page = useRef(null);
  useRevealOnScroll(page, ".lang-wall, .chit, .compare");

  // landing.css is scoped to html.lp, so the mat's colours never leak into the other pages.
  useEffect(() => {
    document.documentElement.classList.add("lp");
    return () => document.documentElement.classList.remove("lp");
  }, []);

  return (
    <>
      <div className="scroll-ink" aria-hidden="true" />
      <Masthead>
        <a className="lp-nav wide" href="#eval">
          Model scores
        </a>
        <a className="lp-nav" href="#signin">
          Sign in
        </a>
        <a className="lp-stamp" href="#signup">
          Get started
        </a>
      </Masthead>

      <main className="landing" ref={page}>
        <Bench />

        <section className="lp-band">
          <h2 className="lp-h">Try it on a sample.</h2>
          <SampleDemo />
        </section>

        <section className="lp-band">
          <h2 className="lp-h">Four ranks, so you know what to fix tonight.</h2>
          <ul className="ranks">
            {RANKS.map(rank => (
              <li key={rank.sev} className={`sev-${rank.sev}`}>
                <b>{rank.sev}</b>
                <p>{rank.text}</p>
                <code>{rank.code}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-band">
          <h2 className="lp-h">Then compare the rewrite with yours.</h2>
          <div className="rev-wrap">
            <Compare />
            <div className="rev-list">
              <p>
                Drag the pen across <code>login.py</code> to see what the reviewer changed.
              </p>
              <ul>
                {REWRITE_NOTES.map(([lines, text]) => (
                  <li key={lines}>
                    <b>{lines}</b>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-band">
          <h2 className="lp-h">Twelve languages, one reviewer.</h2>
          <div className="lang-wall" data-reveal>
            {Object.values(FALLBACK_LANGUAGES).map((language, i) => (
              <span key={language} style={{ "--i": i }}>
                {language}
              </span>
            ))}
          </div>
        </section>

        <section className="handover">
          <div className="chit">
            <h2>
              Hand over your{" "}
              <em>
                first file.
                <svg className="pen-wave" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true">
                  <path d={PEN_UNDERLINE} pathLength="1" />
                </svg>
              </em>
            </h2>
            <a className="lp-btn ink" href="#signup">
              Review my code
            </a>
          </div>
        </section>

        <footer className="lp-foot">
          <p>Project by Akshit Srivastava, Akshat Mishra, and Harsh Raj</p>
          <a className="lp-link" href="/privacy.html">
            Privacy policy
          </a>
        </footer>
      </main>
    </>
  );
}
