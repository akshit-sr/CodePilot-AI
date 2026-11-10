// Every call the frontend makes to the Worker, in one place. Signed-in calls carry the Clerk session token.
import { useAuth } from "@clerk/react";

export function useApi() {
  const { getToken } = useAuth();

  const signedIn = async (path, init = {}) =>
    fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await getToken()}` } });

  const post = (path, body) => signedIn(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  return {
    // Public.
    languages: () => fetch("/languages").then(r => r.json()),

    // Signed in. These resolve to the parsed JSON, or false if the server said no.
    usage: () => signedIn("/usage").then(r => r.ok && r.json()),
    history: () => signedIn("/history").then(r => r.ok && r.json()),

    // Signed in. These resolve to the raw Response, because the caller handles each status itself.
    review: ({ code, language, filename }) => signedIn("/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, language, filename }),
    }),
    translate: ({ code, language, target }) => post("/translate", { code, language, target }),
    flowchart: ({ code, language }) => post("/flowchart", { code, language }),
    openReview: id => signedIn(`/history/${id}`),
    deleteReview: id => signedIn(`/history/${id}`, { method: "DELETE" }),
  };
}
