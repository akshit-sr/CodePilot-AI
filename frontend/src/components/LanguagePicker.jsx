import { useRef } from "react";

// The "written in PYTHON" stamp, with a popover grid of languages under it.
export function LanguagePicker({ languages, language, onPick }) {
  const popover = useRef(null);

  function placeUnder(button) {
    const r = button.getBoundingClientRect();
    popover.current.style.top = r.bottom + 10 + "px";
    popover.current.style.left = Math.max(8, Math.min(r.left, innerWidth - 344)) + "px";
  }

  return (
    <>
      <span className="written-in">written in</span>
      <button
        key={language}
        className="stamp"
        popoverTarget="lang-picker"
        aria-label={`Language: ${languages[language]}. Change language`}
        onClick={e => placeUnder(e.currentTarget)}
      >
        {languages[language]}
      </button>
      <div id="lang-picker" popover="auto" className="lang-picker" ref={popover}>
        <p>Which language is this?</p>
        <div className="lang-grid">
          {Object.entries(languages).map(([id, name]) => (
            <button
              key={id}
              className={id === language ? "on" : ""}
              aria-pressed={id === language}
              onClick={() => {
                onPick(id);
                popover.current.hidePopover();
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
