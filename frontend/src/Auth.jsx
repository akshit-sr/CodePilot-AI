import { SignIn, SignUp } from "@clerk/react";
import { Masthead } from "./shell.jsx";
import "./pages.css";

// Clerk's forms, dressed in the site's paper and ink. Its own header is hidden in favour of ours.
const appearance = {
  variables: { colorPrimary: "var(--ink)", colorPrimaryForeground: "var(--paper)", colorBackground: "var(--paper)", colorForeground: "var(--ink)", colorMutedForeground: "var(--ink-3)", colorInput: "var(--paper-2)", colorInputForeground: "var(--ink)", colorBorder: "var(--rule)", colorRing: "var(--pen)", colorDanger: "var(--pen)", fontFamily: "var(--sans)", borderRadius: "3px" },
  elements: { rootBox: { width: "100%" }, cardBox: { width: "100%", boxShadow: "none", border: "none" }, card: { padding: 0, boxShadow: "none", background: "transparent" }, header: { display: "none" }, footer: { background: "transparent" },
    dividerLine: { background: "var(--rule)" } },
};

export default function Auth({ mode }) {
  const signup = mode === "signup";
  const props = { routing: "hash", appearance, signInUrl: "/#signin", signUpUrl: "/#signup", fallbackRedirectUrl: "/#review" };

  return <>
    <Masthead><a className="navlink" href="#">Back to home</a></Masthead>
    <main className="auth">
      <div className="auth-card">
        <nav className="auth-tabs">
          <a className={signup ? "" : "on"} href="#signin" aria-current={signup ? undefined : "page"}>Sign in</a>
          <a className={signup ? "on" : ""} href="#signup" aria-current={signup ? "page" : undefined}>Create account</a>
        </nav>
        <div className="auth-sheet">
          <h1>{signup ? <>Start a <em>fresh sheet.</em></> : <>Welcome <em>back.</em></>}</h1>
          <p>{signup ? "Create an account and hand in your first file." : "Sign in to get back to your desk."}</p>
          {signup ? <SignUp {...props} /> : <SignIn {...props} />}
        </div>
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
