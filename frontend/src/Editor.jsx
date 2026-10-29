import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Decoration, keymap, placeholder } from "@codemirror/view";
import { Compartment, Prec, StateEffect, StateField } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { LanguageDescription, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter } from "@lezer/highlight";

const setMarks = StateEffect.define();
const marks = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setMarks)) deco = e.value;
    return deco;
  },
  provide: field => EditorView.decorations.from(field),
});

// One line decoration per flagged line; the line shows its note numbers and the worst severity.
function buildMarks(doc, notes, active) {
  const byLine = new Map();
  for (const note of notes) {
    if (note.line < 1 || note.line > doc.lines) continue;
    (byLine.get(note.line) || byLine.set(note.line, []).get(note.line)).push(note);
  }
  const ranges = [...byLine].map(([line, list]) => Decoration.line({
    class: `cm-mark sev-${list[0].severity}${list.some(n => n.n === active) ? " is-active" : ""}`,
    attributes: { "data-notes": list.map(n => n.n).join(" "), style: `--d: ${list[0].n}` },
  }).range(doc.line(line).from));
  return Decoration.set(ranges, true);
}

export default function Editor({ value, onChange, languageName, notes, active, onRun, viewRef }) {
  const host = useRef(null), language = useRef(new Compartment()), handlers = useRef({});
  handlers.current = { onChange, onRun };

  useEffect(() => {
    const view = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => (handlers.current.onRun(), true) }])),
        basicSetup,
        keymap.of([indentWithTab]),
        indentUnit.of("    "),
        syntaxHighlighting(classHighlighter),
        placeholder("Start writing, paste a file, or drop one here…"),
        language.current.of([]),
        marks,
        EditorView.contentAttributes.of({ "aria-label": "Code editor" }),
        EditorView.updateListener.of(u => { if (u.docChanged) handlers.current.onChange(u.state.doc.toString()); }),
      ],
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString())
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const desc = LanguageDescription.matchLanguageName(languages, languageName, false);
    if (!desc) return void viewRef.current?.dispatch({ effects: language.current.reconfigure([]) });
    desc.load().then(support => { if (!cancelled) viewRef.current?.dispatch({ effects: language.current.reconfigure(support) }); });
    return () => { cancelled = true; };
  }, [languageName]);

  useEffect(() => {
    const view = viewRef.current;
    view?.dispatch({ effects: setMarks.of(buildMarks(view.state.doc, notes, active)) });
  }, [notes, active]);

  return <div className="editor" ref={host} />;
}
