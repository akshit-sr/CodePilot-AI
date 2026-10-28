import { ArrowRight } from "lucide-react";
import { Masthead } from "./shell.jsx";
import "./pages.css";

// ponytail: no real auth yet; submitting just opens the workspace. Wire to the backend's auth endpoints once they exist.
export default function Auth({ mode }) {
  const signup = mode === "signup";
  const field = (label, type, autoComplete) =>
    <label className="input"><span>{label}</span><input type={type} autoComplete={autoComplete} spellCheck="false" /></label>;

  return <>
    <Masthead><a className="navlink" href="#/">Back to home</a></Masthead>
    <main className="auth">
      <div className="auth-card">
        <nav className="auth-tabs">
          <a className={signup ? "" : "on"} href="#/signin" aria-current={signup ? undefined : "page"}>Sign in</a>
          <a className={signup ? "on" : ""} href="#/signup" aria-current={signup ? "page" : undefined}>Create account</a>
        </nav>
        <form className="auth-sheet" noValidate onSubmit={e => { e.preventDefault(); location.hash = "#/review"; }}>
          <h1>{signup ? <>Start a <em>fresh sheet.</em></> : <>Welcome <em>back.</em></>}</h1>
          <p>{signup ? "Create an account and hand in your first file." : "Sign in to get back to your desk."}</p>
          {signup && field("Name", "text", "name")}
          {field("Email", "email", "email")}
          {field("Password", "password", signup ? "new-password" : "current-password")}
          <button className="btn-ink wide">{signup ? "Create account" : "Sign in"} <ArrowRight size={16} /></button>
          <p className="switch">{signup
            ? <>Already have an account? <a href="#/signin">Sign in</a></>
            : <>New here? <a href="#/signup">Create an account</a></>}</p>
        </form>
      </div>

      <div className="auth-art" aria-hidden="true">
        <div className="back b2" /><div className="back b1" />
        <div className="art-sheet">
          <i className="w8" /><i className="w6" /><i className="w7 flagged" /><i className="w5" /><i className="w8" /><i className="w4" /><i className="w7" /><i className="w6 flagged" /><i className="w5" />
          <span className="big-stamp">{signup ? "First draft" : "Welcome back"}</span>
        </div>
      </div>
    </main>
  </>;
}
