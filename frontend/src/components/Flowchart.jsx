import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { useApi } from "../api.js";
import { download, toMermaid } from "../review.js";

let drawn = 0;

// A pop-up that draws the flowchart as soon as it opens. Lines the review flagged show up red.
export function Flowchart({ code, language, notes, marked, prepared, derive, onClose, onReview }) {
  const api = useApi();
  const dialog = useRef(null),
    started = useRef(false);
  const [graph, setGraph] = useState(null);
  const [svg, setSvg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(first) {
    setBusy(true);
    setError("");
    setSvg("");
    try {
      const ready = first && prepared ? await prepared.flow.catch(() => null) : null;
      setGraph(ready ?? (await derive(() => api.flowchart({ code, language }))));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    dialog.current.showModal();
    run(true);
  }, []);

  // Mermaid is big, so it loads only when a flowchart is drawn.
  useEffect(() => {
    if (!graph) return;
    let live = true;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
        const out = await mermaid.render("flow" + ++drawn, toMermaid(graph, notes));
        if (live) setSvg(out.svg);
      })
      .catch(() => live && setError("Couldn’t draw that flowchart. Try again."));
    return () => {
      live = false;
    };
  }, [graph, notes]);

  const close = () => dialog.current.close();

  return (
    <dialog
      ref={dialog}
      className="flow-dialog"
      aria-label="Flowchart"
      onClose={onClose}
      onClick={e => e.target === dialog.current && close()}
    >
      <div className="flow-body">
        <div className="flow-head">
          <h2>Flowchart</h2>
          {svg && (
            <button className="link" onClick={() => download("flowchart.svg", svg)}>
              <Download size={14} />
              Download SVG
            </button>
          )}
          <button className="link" disabled={busy} onClick={() => run()}>
            <RefreshCw size={14} />
            Redraw
          </button>
          <button className="link" aria-label="Close" onClick={close}>
            <X size={16} />
          </button>
        </div>
        {!marked && (
          <p className="slip">
            Mark up the code first to see the problem steps in red.{" "}
            <button
              className="link"
              onClick={() => {
                close();
                onReview();
              }}
            >
              Mark it up
            </button>
          </p>
        )}
        {busy && <p className="hint">Drawing the flowchart…</p>}
        {error && <p className="hint">{error}</p>}
        {svg && <div className="flow-chart" dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
    </dialog>
  );
}
