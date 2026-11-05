// Pins each margin note beside its line in the editor, pushing it down if the note above would overlap.
// Runs after every render (notes move as the code changes) and on window resize.
import { useEffect, useLayoutEffect, useState } from "react";

export function usePinnedNotes(editorView, margin, enabled) {
  const [, rerender] = useState(0);
  useEffect(() => {
    const onResize = () => rerender(x => x + 1);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const view = editorView.current, box = margin.current;
    if (!view || !box || !enabled) return;
    const offset = view.documentTop - box.getBoundingClientRect().top;
    let floor = box.querySelector(".margin-head")?.offsetHeight || 0;
    for (const note of box.querySelectorAll(".note")) {
      const line = view.state.doc.line(Math.min(+note.dataset.line, view.state.doc.lines));
      const top = Math.max(offset + view.lineBlockAt(line.from).top - 6, floor);
      note.style.top = top + "px";
      floor = top + note.offsetHeight + 12;
    }
    box.style.setProperty("--notes-height", floor + "px");
  });
}
