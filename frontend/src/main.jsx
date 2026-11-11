// Entry point: sets up sign-in (Clerk) and picks the page from the URL hash.
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/react";
import Landing from "./landing/Landing.jsx";
import Auth from "./Auth.jsx";
import Workspace from "./Workspace.jsx";
import Eval from "./Eval.jsx";
import "./styles.css";

// Routes are hashes (#review, #eval, #signin, #signup, # for home), so the server only ever serves "/".
// No slash after "#": "#/…" belongs to Clerk's own form steps (#/factor-one, #/verify…).
function Root() {
  const [route, setRoute] = useState(location.hash);
  const { isLoaded, isSignedIn } = useAuth();
  const form = useRef(null); // "signin" | "signup" | null; kept while Clerk is on one of its "#/…" steps

  useEffect(() => {
    const onChange = () => {
      setRoute(location.hash);
      scrollTo(0, 0);
    };
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);

  if (route === "#review" && (isSignedIn || !isLoaded)) return isSignedIn ? <Workspace /> : null;
  if (route === "#eval") return <Eval />;

  if (route === "#signin" || route === "#signup") form.current = route.slice(1);
  else if (route === "#review")
    form.current = "signin"; // signed out: sign in first
  else if (!route.startsWith("#/")) form.current = null;
  else form.current ??= "signin"; // a fresh load on one of Clerk's steps, e.g. back from Google at #/sso-callback

  return form.current ? <Auth key={form.current} mode={form.current} /> : <Landing />;
}

// Clerk navigates with these. They only change the hash; without them Clerk waits for a page load that never comes.
const navigate = replace => to => {
  const { hash } = new URL(to, location.href);
  if (replace) location.replace(hash || "#");
  else location.hash = hash;
};

// Reuse the root across Vite hot reloads.
const root = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;

root.render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/#"
      routerPush={navigate(false)}
      routerReplace={navigate(true)}
    >
      <Root />
    </ClerkProvider>
  </React.StrictMode>,
);
