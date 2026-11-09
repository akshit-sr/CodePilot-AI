import { Check, Copy } from "lucide-react";

// The Changes view: your code against the reviewer's rewrite, from diffLines().
export function DiffView({ rows, copied, onCopy, onDownload, onUse }) {
  return <div className="draft-view">
    <div className="draft-bar">
      <p><span className="del-key">struck</span> lines are yours, <span className="add-key">green</span> lines are the reviewer’s fix.</p>
      <button className="link" onClick={onCopy}>
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
      </button>
      <button className="link" onClick={onDownload}>Download</button>
      <button className="link" onClick={onUse}>Use this version</button>
    </div>
    <pre className="diff">
      {rows.map(([op, text, line], i) =>
        <div key={i} className={op === "+" ? "add" : op === "-" ? "del" : ""}>
          <span className="dn">{line}</span><span className="op">{op}</span><span className="t">{text}</span>
        </div>
      )}
    </pre>
  </div>;
}
