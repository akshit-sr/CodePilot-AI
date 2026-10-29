import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };
export const store = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

export function Masthead({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  useEffect(() => { document.documentElement.dataset.theme = theme; store("codepilot.theme", theme); }, [theme]);
  return <header className="masthead">
    <a className="wordmark" href="#">Code<em>Pilot</em><span className="tick" aria-hidden="true">✓</span></a>
    <span className="tagline">code review, marked up</span>
    <nav>
      {children}
      <button className="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
    </nav>
  </header>;
}
