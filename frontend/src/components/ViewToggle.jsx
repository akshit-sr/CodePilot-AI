// "Your code" / "Changes", shown once the reviewer has offered a rewrite.
export function ViewToggle({ view, onChange }) {
  const views = [
    ["code", "Your code"],
    ["changes", "Changes"],
  ];
  return (
    <div className="view-toggle" role="group" aria-label="Show on the sheet">
      {views.map(([id, label]) => (
        <button key={id} className={view === id ? "on" : ""} aria-pressed={view === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
