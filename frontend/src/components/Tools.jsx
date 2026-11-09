import { useRef } from "react";
import { BookOpen, Download, Eraser, Paperclip } from "lucide-react";
import { EXT } from "../review.js";

const ACCEPTED_FILES = Object.keys(EXT).map(ext => "." + ext).join(",") + ",.txt";

export function Tools({ hasCode, onAttach, onExample, onDownload, onClear }) {
  const upload = useRef(null);
  return <div className="tools">
    <button className="tool" onClick={() => upload.current.click()}><Paperclip size={15} />Attach file</button>
    <button className="tool" onClick={onExample}><BookOpen size={15} />Example</button>
    {hasCode && <button className="tool" onClick={onDownload}><Download size={15} />Download</button>}
    {hasCode && <button className="tool" onClick={onClear}><Eraser size={15} />Fresh sheet</button>}
    <input
      ref={upload}
      hidden
      type="file"
      accept={ACCEPTED_FILES}
      onChange={e => { onAttach(e.target.files[0]); e.target.value = ""; }}
    />
  </div>;
}
