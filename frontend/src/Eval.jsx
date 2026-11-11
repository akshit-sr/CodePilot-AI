// Model scores from eval/run_eval.py (Python), served as /eval.json. Public: no sign-in needed.
import { useEffect, useState } from "react";
import { Masthead } from "./shell.jsx";
import "./pages.css";

const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

const short = (name) => name.split("-").slice(0, 2).join("-"); // e.g. "qwen3.5-9b-instruct" -> "qwen3.5-9b"
const name = (c) => c.title ?? c.file;

// One bar: k picks the model's color index (.s0, .s1, etc.); failed draws a striped track
const Bar = ({ k = 0, value = 0, max = 1, label, tip, failed }) => {
  const fillWidth = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  return (
    <div className="cbar" data-tip={tip} tabIndex={0}>
      <i className="ctrack">
        {failed ? (
          <span className="cfail" />
        ) : (
          <span className={`cfill s${k}`} style={{ width: `${fillWidth}%` }} />
        )}
      </i>
      <b>{label}</b>
    </div>
  );
};

function Charts({ data }) {
  const ms = data.models || [];
  const timed = ms.filter((m) => typeof m.avg_seconds === "number" && m.avg_seconds > 0);

  const fast = timed.length
    ? timed.reduce((a, b) => (b.avg_seconds < a.avg_seconds ? b : a), timed[0])
    : null;
  const slow = timed.length
    ? timed.reduce((a, b) => (b.avg_seconds > a.avg_seconds ? b : a), timed[0])
    : null;

  const maxSpeed = slow ? slow.avg_seconds * 1.05 : 1;

  return (
    <div className="eval-charts">
      <div className="clegend">
        {ms.map((m, k) => (
          <span key={m.name}>
            <i className={`s${k}`} />
            {m.name}
            <em>{m.failures ? `${m.failures} failed` : "0 failed"}</em>
          </span>
        ))}
      </div>

      <div className="charts">
        {/* Accuracy Comparison */}
        <figure className="chart">
          <figcaption>
            Accuracy<span>higher is better</span>
          </figcaption>
          {/* The two quality rows are hand scores from eval/rate.py; they appear once someone has rated. */}
          {[
            ["Bugs caught", (m) => m.recall],
            ["Explanation quality (rated by hand)", (m) => m.quality?.explanation],
            ["Fix quality (rated by hand)", (m) => m.quality?.fix],
          ]
            .filter(([, get], n) => n === 0 || ms.some((m) => get(m) != null))
            .map(([label, get]) => (
              <div className="cgroup" key={label}>
                <p>{label}</p>
                {ms.map((m, k) => (
                  <Bar
                    key={m.name}
                    k={k}
                    value={get(m) ?? 0}
                    max={1}
                    label={pct(get(m))}
                    tip={`${short(m.name)}: ${pct(get(m))} ${label.toLowerCase()}`}
                  />
                ))}
              </div>
            ))}
          <div className="caxis">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </figure>

        {/* Speed Comparison */}
        <figure className="chart">
          <figcaption>
            Speed<span>seconds per file, shorter is faster</span>
          </figcaption>
          {fast && slow && fast.name !== slow.name && (
            <p className="chero">
              <b>{(slow.avg_seconds / fast.avg_seconds).toFixed(1)}×</b> faster: {short(fast.name)}
            </p>
          )}
          <div className="cgroup">
            {ms.map((m, k) => (
              <Bar
                key={m.name}
                k={k}
                value={m.avg_seconds ?? 0}
                max={maxSpeed}
                label={m.avg_seconds != null ? `${m.avg_seconds}s` : "—"}
                tip={`${short(m.name)}: ${m.avg_seconds ?? "—"}s per file`}
              />
            ))}
          </div>
        </figure>

        {/* Per-File Breakdown */}
        <figure className="chart wide">
          <figcaption>Bugs caught per file</figcaption>
          <div className="cfiles">
            {data.cases?.map((c, i) => (
              <div className="cgroup" key={c.file}>
                <p>
                  <code>{name(c)}</code>
                </p>
                {ms.map((m, k) => {
                  const r = m.results?.[i] ?? {};
                  const tip = `${short(m.name)} on ${name(c)}: `;
                  const total = c.bugs?.length ?? 1;

                  if (r.error) {
                    return <Bar key={m.name} failed label="failed" tip={`${tip}no usable answer`} />;
                  }
                  if (!c.bugs || c.bugs.length === 0) {
                    return <Bar key={m.name} k={k} label="no bugs" tip={`${tip}clean file`} />;
                  }
                  return (
                    <Bar
                      key={m.name}
                      k={k}
                      value={r.caught ?? 0}
                      max={total}
                      label={`${r.caught ?? 0}/${total}`}
                      tip={`${tip}${r.caught ?? 0} of ${total} caught (${r.seconds ?? "—"}s)`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </figure>
      </div>
    </div>
  );
}

function Detail({ c, i, models }) {
  const bugAt = new Map((c.bugs || []).map((b) => [b.line, b.label]));

  return (
    <div className="eval-detail">
      <div>
        <h3>
          <code>{name(c)}</code>
        </h3>
        <pre className="eval-code">
          {(c.code || "")
            .replace(/\n$/, "")
            .split("\n")
            .map((line, n) => (
              <div key={n} className={bugAt.has(n + 1) ? "bug" : undefined}>
                <span className="ln">{n + 1}</span>
                {line || " "}
                {bugAt.has(n + 1) && <em>{bugAt.get(n + 1)}</em>}
              </div>
            ))}
        </pre>
        {(!c.bugs || !c.bugs.length) && <p className="eval-note">No known bugs in this file.</p>}
      </div>

      {models.map((m) => {
        const r = m.results?.[i] ?? {};
        return (
          <div key={m.name}>
            <h3>{m.name}</h3>
            {r.error ? (
              <p className="eval-note">Failed: no answer within the time limit, or an unreadable answer.</p>
            ) : !r.findings?.length ? (
              <p className="eval-note">No findings.</p>
            ) : (
              <ul className="eval-findings">
                {r.findings.map((f, k) => (
                  <li key={k} className={f.real ? "real" : "extra"}>
                    <b>
                      Line {f.line} · {f.severity} · {f.type}
                    </b>{" "}
                    {f.real && <span>matches the known bug</span>}
                    <p>{f.explanation}</p>
                    {f.suggested_fix && <p>Fix: {f.suggested_fix}</p>}
                  </li>
                ))}
              </ul>
            )}
            {r.missed?.length > 0 && <p className="eval-note">Missed: {r.missed.join(", ")}</p>}
          </div>
        );
      })}
    </div>
  );
}

const FILES = ["eval-quixbugs.json", "eval-juliet.json", "eval.json"];
const title = (data) => data.suite?.title ?? "Our test set";

function Suite({ data }) {
  const [open, setOpen] = useState(null);
  const s = data.suite ?? {};

  return (
    <>
      <p className="eval-intro">
        {s.description ?? `${data.cases.length} files with ${data.total_bugs} known bugs that we wrote.`}
        {s.source && (
          <>
            {" "}
            <a href={s.source} target="_blank" rel="noreferrer">
              Source
            </a>
            .
          </>
        )}
      </p>

      <Charts data={data} />

      <div className="eval-scroll">
        <table className="eval-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Bugs</th>
              {data.models.map((m) => (
                <th key={m.name}>{m.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.cases.map((c, i) => (
              <tr key={c.file}>
                <td>
                  <button
                    type="button"
                    className="eval-file"
                    aria-expanded={open === i}
                    onClick={() => setOpen(open === i ? null : i)}
                  >
                    <code>{name(c)}</code>
                  </button>
                </td>
                <td>{c.bugs?.length ?? 0}</td>
                {data.models.map((m) => {
                  const r = m.results?.[i] ?? {};
                  const total = c.bugs?.length ?? 0;
                  return (
                    <td
                      key={m.name}
                      title={r.missed?.length ? `Missed: ${r.missed.join(", ")}` : undefined}
                    >
                      {r.error ? "failed" : `${r.caught}/${total} caught · ${r.seconds}s`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="eval-note">Click a file to see the program and what each model found.</p>
      {open != null && <Detail c={data.cases[open]} i={open} models={data.models} />}
    </>
  );
}

export default function Eval() {
  const [suites, setSuites] = useState(undefined);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    Promise.all(
      FILES.map((f) =>
        fetch("/" + f).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      )
    ).then((all) => setSuites(all.filter(Boolean)));
  }, []);

  return (
    <>
      <Masthead>
        <a className="navlink" href="#">
          Home
        </a>
      </Masthead>
      <main className="landing">
        <section className="section">
          <div className="section-head">
            <span>§</span>
            <h2>How well does it review?</h2>
          </div>
          {suites === undefined ? (
            <p className="eval-note">Loading…</p>
          ) : !suites.length ? (
            <p className="eval-note">
              No results yet: run <code>uv run python run_eval.py</code> in <code>eval/</code>.
            </p>
          ) : (
            <>
              {suites.length > 1 && (
                <div className="eval-tabs" role="tablist">
                  {suites.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={tab === i}
                      onClick={() => setTab(i)}
                    >
                      {title(d)}
                    </button>
                  ))}
                </div>
              )}
              <Suite key={tab} data={suites[tab]} />
            </>
          )}
        </section>
      </main>
    </>
  );
}