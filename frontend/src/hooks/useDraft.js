// The file on the sheet: its code, name and language. Saved to localStorage so a refresh doesn't lose it.
import { useEffect, useState } from "react";
import { stored, store } from "../shell.jsx";

export function useDraft() {
  const [code, setCode] = useState(() => stored("codepilot.code") ?? "");
  const [filename, setFilename] = useState(() => stored("codepilot.filename") || "untitled.py");
  const [language, setLanguage] = useState(() => stored("codepilot.language") || "python");

  useEffect(() => {
    store("codepilot.code", code);
    store("codepilot.filename", filename);
    store("codepilot.language", language);
  }, [code, filename, language]);

  return { code, setCode, filename, setFilename, language, setLanguage };
}
