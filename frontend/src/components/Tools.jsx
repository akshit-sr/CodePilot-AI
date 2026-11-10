import { useRef } from "react";
import { BookOpen, ChevronDown, Download, Eraser, FileText, Languages, Paperclip, Workflow } from "lucide-react";
import { EXT } from "../review.js";

const ACCEPTED_FILES = Object.keys(EXT).map(ext => "." + ext).join(",") + ",.txt";

// File housekeeping lives in one menu; the two features stay as buttons.
export function Tools({ hasCode, reviewed, preparing, onAttach, onExample, onDownload, onFlow, onTranslate, onClear }) {
  const upload = useRef(null), menu = useRef(null);

  function placeUnder(button) {
    const r = button.getBoundingClientRect();
    menu.current.style.top = r.bottom + 6 + "px";
    menu.current.style.left = Math.max(8, Math.min(r.left, innerWidth - 236)) + "px";
  }
  const pick = fn => () => { menu.current.hidePopover(); fn(); };

  return <div className="tools">
    <button className="tool" popoverTarget="file-menu" onClick={e => placeUnder(e.currentTarget)}><FileText size={15} />File<ChevronDown size={13} /></button>
    {reviewed && <button className="tool" onClick={onFlow}><Workflow size={15} />Flowchart{preparing && <i className="prep" title="Getting this ready" />}</button>}
    {reviewed && <button className="tool" onClick={onTranslate}><Languages size={15} />Translate{preparing && <i className="prep" title="Getting this ready" />}</button>}
    <div id="file-menu" popover="auto" className="menu" ref={menu}>
      <button onClick={pick(() => upload.current.click())}><Paperclip size={15} />Attach file</button>
      <button onClick={pick(onExample)}><BookOpen size={15} />Example</button>
      {hasCode && <button onClick={pick(onDownload)}><Download size={15} />Download</button>}
      {hasCode && <button onClick={pick(onClear)}><Eraser size={15} />Fresh sheet</button>}
    </div>
    <input
      ref={upload}
      hidden
      type="file"
      accept={ACCEPTED_FILES}
      onChange={e => { onAttach(e.target.files[0]); e.target.value = ""; }}
    />
  </div>;
}
