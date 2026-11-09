// Model scores from eval/run_eval.py (Python), served as /eval.json. Public: no sign-in needed.
import { useEffect, useState } from "react";
import { Masthead } from "./shell.jsx";
import "./pages.css";

const pct = x => x == null ? "—" : `${Math.round(x * 100)}%`;

const short = name => name.split("-").slice(0, 2).join("-");   // "qwen3.8-27b-uncensored-mtp:latest" -> "qwen3.8-27b"

// One bar: k picks the model's color; failed draws a striped track instead of a fill.
const Bar = ({ k, value = 0, max = 1, label, tip, failed }) => <div className="cbar" data-tip={tip} tabIndex={0}>
  <i className="ctrack">{failed ? <span className="cfail" /> : <span className={`cfill s${k}`} style={{ width: `${Math.min(value / max, 1) * 100}%` }} />}</i>
  <b>{label}</b>
</div>;

function Charts({ data }) {
  const ms = data.models, timed = ms.filter(m => m.avg_seconds);
  const fast = timed.reduce((a, b) => b.avg_seconds < a.avg_seconds ? b : a, timed[0]);
  const slow = timed.reduce((a, b) => b.avg_seconds > a.avg_seconds ? b : a, timed[0]);
  return <div className="eval-charts">
    <div className="clegend">{ms.map((m, k) => <span key={m.name}><i className={`s${k}`} />{m.name}<em>{m.failures} failed</em></span>)}</div>
    <div className="charts">
      <figure className="chart">
        <figcaption>Accuracy<span>higher is better</span></figcaption>
        {[["Bugs caught", "recall"], ["Findings that were real", "precision"]].map(([label, key]) => <div className="cgroup" key={key}>
          <p>{label}</p>
          {ms.map((m, k) => <Bar key={m.name} k={k} value={m[key] ?? 0} label={pct(m[key])} tip={`${short(m.name)}: ${pct(m[key])} ${label.toLowerCase()}`} />)}
        </div>)}
        <div className="caxis"><span>0%</span><span>50%</span><span>100%</span></div>
      </figure>
      <figure className="chart">
        <figcaption>Speed<span>seconds per file, shorter is faster</span></figcaption>
        {fast && slow !== fast && <p className="chero"><b>{(slow.avg_seconds / fast.avg_seconds).toFixed(1)}×</b>faster: {short(fast.name)}</p>}
        <div className="cgroup">{ms.map((m, k) => <Bar key={m.name} k={k} value={m.avg_seconds ?? 0} max={slow?.avg_seconds || 1}
          label={m.avg_seconds ? `${m.avg_seconds}s` : "—"} tip={`${short(m.name)}: ${m.avg_seconds ?? "—"}s per file`} />)}</div>
      </figure>
      <figure className="chart wide">
        <figcaption>Bugs caught per file</figcaption>
        <div className="cfiles">{data.cases.map((c, i) => <div className="cgroup" key={c.file}>
          <p><code>{c.file}</code></p>
          {ms.map((m, k) => { const r = m.results[i], tip = `${short(m.name)} on ${c.file}: `;
            return r.error ? <Bar key={m.name} failed label="failed" tip={tip + "no usable answer"} />
              : c.bugs.length ? <Bar key={m.name} k={k} value={r.caught} max={c.bugs.length} label={`${r.caught}/${c.bugs.length}`} tip={`${tip}${r.caught} of ${c.bugs.length} caught, ${r.extra} extra`} />
              : <Bar key={m.name} k={k} label={`${r.extra} extra`} tip={`${tip}clean file, ${r.extra} extra`} />; })}
        </div>)}</div>
      </figure>
    </div>
  </div>;
}

function Detail({ c, i, models }) {
  const bugAt = new Map(c.bugs.map(b => [b.line, b.label]));
  return <div className="eval-detail">
    <div>
      <h3><code>{c.file}</code></h3>
      <pre className="eval-code">{c.code.replace(/\n$/, "").split("\n").map((line, n) => <div key={n} className={bugAt.has(n + 1) ? "bug" : undefined}>
        <span className="ln">{n + 1}</span>{line || " "}{bugAt.has(n + 1) && <em>{bugAt.get(n + 1)}</em>}
      </div>)}</pre>
      {!c.bugs.length && <p className="eval-note">No known bugs: every finding here counts as extra.</p>}
    </div>
    {models.map(m => { const r = m.results[i]; return <div key={m.name}>
      <h3>{m.name}</h3>
      {r.error ? <p className="eval-note">Failed: no answer within the time limit, or an unreadable answer.</p>
        : !r.findings.length ? <p className="eval-note">No findings.</p>
        : <ul className="eval-findings">{r.findings.map((f, k) => <li key={k} className={f.real ? "real" : "extra"}>
            <b>Line {f.line} · {f.severity} · {f.type}</b> <span>{f.real ? "matches a known bug" : "extra"}</span>
            <p>{f.explanation}</p>
          </li>)}</ul>}
      {r.missed?.length > 0 && <p className="eval-note">Missed: {r.missed.join(", ")}</p>}
    </div>; })}
  </div>;
}

export default function Eval() {
  const [data, setData] = useState(undefined);
  const [open, setOpen] = useState(null);
  useEffect(() => { fetch("/eval.json").then(r => r.ok ? r.json() : null, () => null).then(setData); }, []);

  return <>
    <Masthead><a className="navlink" href="#">Home</a></Masthead>
    <main className="landing">
      <section className="section">
        <div className="section-head"><span>§</span><h2>How well does it review?</h2></div>
        {data === undefined ? <p className="eval-note">Loading…</p>
          : !data ? <p className="eval-note">No results yet: run <code>uv run python run_eval.py</code> in <code>eval/</code>.</p>
          : <>
            <p className="eval-note">{data.cases.length} files with {data.total_bugs} known bugs, run {new Date(data.generated_at).toLocaleString()}. A finding within {data.tolerance} line of a known bug counts as a catch.</p>
            <Charts data={data} />
            <div className="eval-scroll"><table className="eval-table">
              <thead><tr><th>File</th><th>Bugs</th>{data.models.map(m => <th key={m.name}>{m.name}</th>)}</tr></thead>
              <tbody>{data.cases.map((c, i) => <tr key={c.file}>
                <td><button className="eval-file" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}><code>{c.file}</code></button></td><td>{c.bugs.length}</td>
                {data.models.map(m => { const r = m.results[i]; return <td key={m.name} title={r.missed?.length ? `Missed: ${r.missed.join(", ")}` : undefined}>
                  {r.error ? "failed" : `${r.caught}/${c.bugs.length} caught · ${r.extra} extra · ${r.seconds}s`}
                </td>; })}
              </tr>)}</tbody>
            </table></div>
            <p className="eval-note">Click a file to see the program and what each model found.</p>
            {open != null && <Detail c={data.cases[open]} i={open} models={data.models} />}
          </>}
      </section>
    </main>
  </>;
}
