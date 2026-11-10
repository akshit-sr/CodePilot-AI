import { afterEach, beforeEach, expect, mock, test } from "bun:test";

// Clerk stand-in: the token "good" belongs to user_1, "other" to user_2; anything else is rejected.
mock.module("@clerk/backend", () => ({
  verifyToken: async (token: string) => {
    const sub = { good: "user_1", other: "user_2" }[token];
    if (!sub) throw new Error("invalid token");
    return { sub };
  },
}));
const { default: app, LANGUAGES } = await import("./index");
type Env = import("./index").Env;

const MODEL = "https://model.test/v1/chat/completions", DB = "https://db.test";
const env: Env = { MODEL_URL: MODEL, MODEL_NAME: "qwen-primary", SUPABASE_URL: DB, SUPABASE_SECRET_KEY: "sb_secret_test", CLERK_SECRET_KEY: "sk_test", REVIEW_LIMIT: "3" };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// In-memory Supabase: just the REST calls the Worker makes.
let rows: { reviews: any[]; usage: Record<string, number> }, dbDown: boolean;
beforeEach(() => { rows = { reviews: [], usage: {} }; dbDown = false; });
async function supabase(url: URL, init: RequestInit) {
  if (dbDown) return new Response("down", { status: 500 });
  expect(new Headers(init.headers).get("apikey")).toBe("sb_secret_test");
  const body = init.body ? JSON.parse(init.body as string) : null, q = url.searchParams;
  const eq = (k: string) => q.get(k)?.replace(/^eq\./, "");
  switch (url.pathname) {
    case "/rest/v1/rpc/take_review": {
      const used = rows.usage[body.p_user] ?? 0;
      if (used >= body.p_limit) return Response.json(-1);
      rows.usage[body.p_user] = used + 1;
      return Response.json(body.p_limit - used - 1);
    }
    case "/rest/v1/rpc/return_review":
      rows.usage[body.p_user]--;
      return new Response(null, { status: 204 });
    case "/rest/v1/reviews":
      if (init.method === "POST") {
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...body };
        rows.reviews.push(row);
        return Response.json([{ id: row.id }], { status: 201 });
      }
      if (init.method === "DELETE") {
        const gone = rows.reviews.filter(r => r.user_id === eq("user_id") && r.id === eq("id"));
        rows.reviews = rows.reviews.filter(r => !gone.includes(r));
        return Response.json(gone);
      }
      return Response.json(rows.reviews.filter(r => r.user_id === eq("user_id") && (!q.has("id") || r.id === eq("id"))));
    case "/rest/v1/usage_windows":
      return Response.json(rows.usage[eq("user_id")!] ? [{ reviews: rows.usage[eq("user_id")!] }] : []);
  }
  throw new Error(`unexpected db call ${url}`);
}

// Stand-in for the model: records each call's URL and JSON body, answers with `reply`.
function model(reply: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; body: any; auth: string | null }[] = [];
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    if (url.origin === DB) return supabase(url, init);
    calls.push({ url: input, body: JSON.parse(init.body as string), auth: new Headers(init.headers).get("Authorization") });
    return reply(input);
  }) as typeof fetch;
  return calls;
}
const answer = (content: string) => Response.json({ choices: [{ message: { content } }] });
const get = (path: string, token = "good") => app.request(path, { headers: { Authorization: `Bearer ${token}` } }, env);
const review = (body: object, e: Env = env, token = "good") =>
  app.request("/review", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }, e);

test("health and languages are public", async () => {
  expect(await (await app.request("/health", {}, env)).json()).toEqual({ status: "ok" });
  expect(await (await app.request("/languages", {}, env)).json()).toEqual(LANGUAGES);
});

test.each([["/review", "POST"], ["/history", "GET"], ["/history/x", "GET"], ["/history/x", "DELETE"], ["/usage", "GET"]])("%s needs a signed-in user", async (path, method) => {
  for (const headers of [{}, { Authorization: "Bearer forged" }, { Authorization: "good" }]) {
    const res = await app.request(path, { method, headers }, env);
    expect([res.status, (await res.json()).detail]).toEqual([401, "sign_in_required"]);
  }
});

test("review contract: model call, saved to history, counted against the limit", async () => {
  const calls = model(() => answer('{"findings": [], "improved_code": null}'));
  const res = await review({ code: "print('ok')", filename: "main.py" });
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toEqual({ findings: [], improved_code: null, id: rows.reviews[0].id, reviews_left: 2, backup: null });
  expect(calls[0].url).toBe(MODEL);
  expect(calls[0].body.model).toBe("qwen-primary");
  expect(calls[0].body.reasoning_effort).toBe("none");
  expect(rows.reviews[0]).toMatchObject({ user_id: "user_1", filename: "main.py", language: "python", code: "print('ok')", findings: [], improved_code: null });
});

test("usage limit: the 4th review of 3 is refused without calling the model", async () => {
  const calls = model(() => answer('{"findings": []}'));
  for (const left of [2, 1, 0]) expect((await (await review({ code: "x = 1" })).json()).reviews_left).toBe(left);
  const res = await review({ code: "x = 1" });
  expect([res.status, (await res.json()).detail]).toEqual([429, "daily_limit_reached"]);
  expect(calls.length).toBe(3);
  expect(await (await get("/usage")).json()).toMatchObject({ limit: 3, used: 3, left: 0 });
  expect(await (await get("/usage", "other")).json()).toMatchObject({ limit: 3, used: 0, left: 3 });
  const reset = Date.parse((await (await get("/usage")).json()).resets_at);
  expect(reset).toBeGreaterThan(Date.now());
  expect(reset - Date.now()).toBeLessThanOrEqual(3 * 3600_000);
  expect(reset % (3 * 3600_000)).toBe(0);
});

test("a failed model call gives the review back", async () => {
  model(() => Promise.reject(new TypeError("down")));
  expect((await review({ code: "x = 1" })).status).toBe(503);
  expect(rows.usage.user_1).toBe(0);
  expect(rows.reviews).toEqual([]);
});

test("database down: review refused before the model is called", async () => {
  const calls = model(() => answer('{"findings": []}'));
  dbDown = true;
  const res = await review({ code: "x = 1" });
  expect([res.status, (await res.json()).detail]).toEqual([503, "database_unavailable"]);
  expect(calls.length).toBe(0);
});

test("history lists only your own reviews, and opens one by id", async () => {
  model(() => answer('{"findings": [], "improved_code": "y = 2"}'));
  const mine = (await (await review({ code: "x = 1", filename: "a.py" })).json()).id;
  await review({ code: "x = 2", filename: "b.py" }, env, "other");
  const list = await (await get("/history")).json();
  expect(list.map((r: any) => r.filename)).toEqual(["a.py"]);
  expect(await (await get(`/history/${mine}`)).json()).toMatchObject({ id: mine, code: "x = 1", improved_code: "y = 2" });
  expect((await get(`/history/${mine}`, "other")).status).toBe(404);
  expect((await get("/history/not-a-uuid")).status).toBe(404);
});

test("deleting a review: only your own, then it's gone", async () => {
  model(() => answer('{"findings": []}'));
  const mine = (await (await review({ code: "x = 1", filename: "a.py" })).json()).id;
  const theirs = (await (await review({ code: "x = 2", filename: "b.py" }, env, "other")).json()).id;
  const del = (id: string, token = "good") => app.request(`/history/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
  expect((await del(theirs)).status).toBe(404);
  expect((await del("not-a-uuid")).status).toBe(404);
  expect((await del(mine)).status).toBe(204);
  expect((await get(`/history/${mine}`)).status).toBe(404);
  expect(await (await get("/history")).json()).toEqual([]);
  expect((await del(mine)).status).toBe(404);
  expect((await get(`/history/${theirs}`, "other")).status).toBe(200);
});

test("the prompt asks for comments to be left alone", async () => {
  const calls = model(() => answer('{"findings": []}'));
  await review({ code: "# keep me\nx = 1" });
  expect(calls[0].body.messages[1].content).toContain("Leave every comment exactly as written");
});

test("the prompt numbers each source line", async () => {
  const calls = model(() => answer('{"findings": []}'));
  await review({ code: "a = 1\nb = 2" });
  expect(calls[0].body.messages[1].content).toContain("1| a = 1\n2| b = 2");
});

test("findings are passed through, extra keys dropped, numeric strings accepted", async () => {
  model(() => answer(JSON.stringify({ findings: [{ type: "bug", severity: "high", line: "3", column: 1, explanation: "x", suggested_fix: "y", extra: 1 }], improved_code: "z" })));
  expect(await (await review({ code: "x = 1" })).json()).toMatchObject({
    findings: [{ type: "bug", severity: "high", line: 3, column: 1, explanation: "x", suggested_fix: "y" }], improved_code: "z",
  });
});

test("falls back to the local model when one is configured", async () => {
  const calls = model(url => url === MODEL ? Promise.reject(new TypeError("down")) : answer('{"findings": []}'));
  const res = await review({ code: "x = 1" }, { ...env, FALLBACK_MODEL_URL: "https://backup.test/v1/chat/completions", FALLBACK_MODEL_NAME: "qwen3.5-9b", FALLBACK_MODEL_KEY: "backup-key" });
  expect(res.status).toBe(200);
  expect(calls.at(-1)!.body.model).toBe("qwen3.5-9b");
  expect(calls.map(c => c.auth)).toEqual([null, "Bearer backup-key"]);
  expect((await res.json()).backup).toEqual({ model: "qwen3.5-9b", reason: "model_unavailable" });
});

test("a review from the primary model says there was no backup", async () => {
  model(() => answer('{"findings": []}'));
  expect((await (await review({ code: "x = 1" })).json()).backup).toBeNull();
});

test("when the primary and the backup both fail, the error says all models are unavailable", async () => {
  model(() => Promise.reject(new TypeError("down")));
  const res = await review({ code: "x = 1" }, { ...env, FALLBACK_MODEL_URL: "https://backup.test/v1/chat/completions", FALLBACK_MODEL_NAME: "qwen3.5-9b" });
  expect([res.status, (await res.json()).detail]).toEqual([503, "all_models_unavailable"]);
  expect(rows.usage.user_1).toBe(0);
});

test("without a fallback the primary's error is returned", async () => {
  model(() => Promise.reject(new TypeError("down")));
  const res = await review({ code: "x = 1" });
  expect([res.status, (await res.json()).detail]).toEqual([503, "model_unavailable"]);
});

test.each([
  [{ code: "x = 1", language: "brainfuck" }, 422, "unsupported_language"],
  [{ code: "x = 1", language: "constructor" }, 422, "unsupported_language"],
  [{ code: "" }, 422, "invalid_request"],
  [{ language: "python" }, 422, "invalid_request"],
  [{ code: "x".repeat(30_001) }, 413, "code_too_large"],
])("rejects %#", async (body, status, detail) => {
  const res = await review(body);
  expect([res.status, (await res.json()).detail]).toEqual([status, detail]);
});

test.each(Object.keys(LANGUAGES))("prompt names %s", async language => {
  const calls = model(() => answer('{"findings": []}'));
  expect((await review({ code: "x", language: language.toUpperCase() })).status).toBe(200);
  expect(calls[0].body.messages[1].content).toContain(`Review this ${LANGUAGES[language]} source file`);
});

test("the backup model gets its own, longer timeout", async () => {
  const timeouts: number[] = [], real = AbortSignal.timeout;
  AbortSignal.timeout = (ms: number) => { timeouts.push(ms); return new AbortController().signal; };
  try {
    model(url => url === MODEL ? Promise.reject(new TypeError("down")) : answer('{"findings": []}'));
    await review({ code: "x = 1" }, { ...env, MODEL_TIMEOUT_MS: "1000", FALLBACK_MODEL_TIMEOUT_MS: "5000", FALLBACK_MODEL_URL: "https://backup.test/v1/chat/completions" });
  } finally {
    AbortSignal.timeout = real;
  }
  expect(timeouts).toEqual([1000, 5000]);
});

// A streamed answer: the text arrives in small pieces, as server-sent events.
const streamed = (...pieces: string[]) => new Response(
  pieces.map(p => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join("") + "data: [DONE]\n\n",
  { headers: { "Content-Type": "text/event-stream" } },
);

test("a streamed answer is put back together, and the request asks for a stream", async () => {
  const calls = model(() => streamed('{"findings": [{"type":"bug","severity":"low","line":2,', '"column":1,"explanation":"e","suggested_fix":"f"}]}'));
  const data = await (await review({ code: "x = 1" })).json();
  expect(calls[0].body.stream).toBe(true);
  expect(data.findings.map((f: any) => f.line)).toEqual([2]);
});

test("a stream that stops partway is a timeout, not a broken review", async () => {
  model(() => new Response(new ReadableStream({ pull(c) { c.error(new DOMException("slow", "TimeoutError")); } }), { headers: { "Content-Type": "text/event-stream" } }));
  const res = await review({ code: "x = 1" });
  expect([res.status, (await res.json()).detail]).toEqual([504, "model_timeout"]);
  expect(rows.usage.user_1).toBe(0);
});

test("model timeout", async () => {
  model(() => Promise.reject(new DOMException("slow", "TimeoutError")));
  const res = await review({ code: "x = 1" });
  expect([res.status, (await res.json()).detail]).toEqual([504, "model_timeout"]);
});

test.each([
  {}, { choices: [] }, { choices: [{ message: { content: "not json" } }] },
  { choices: [{ message: { content: '{"findings": [], "notes": 1}' } }] },
  { choices: [{ message: { content: '{"findings": [{"type": "bug"}]}' } }] },
])("malformed model output %#", async body => {
  model(() => Response.json(body));
  const res = await review({ code: "x = 1" });
  expect([res.status, (await res.json()).detail]).toEqual([502, "malformed_model_output"]);
});

const post = (path: string, body: object, token = "good") =>
  app.request(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }, env);

test("translate returns the model's code and counts one use", async () => {
  const calls = model(() => answer('{"code": "let x = 1;"}'));
  const res = await post("/translate", { code: "x = 1", language: "python", target: "javascript" });
  expect(await res.json()).toEqual({ code: "let x = 1;", language: "javascript", reviews_left: 2 });
  expect(calls[0].body.messages[1].content).toContain("as JavaScript code");
});

test("translate refuses an unknown target without using the model or a review", async () => {
  const calls = model(() => answer("{}"));
  expect((await post("/translate", { code: "x = 1", target: "cobol" })).status).toBe(422);
  expect(calls.length).toBe(0);
  expect(rows.usage.user_1 ?? 0).toBe(0);
});

test("a translation with no code gives the use back", async () => {
  model(() => answer('{"code": ""}'));
  expect((await post("/translate", { code: "x = 1", target: "go" })).status).toBe(502);
  expect(rows.usage.user_1).toBe(0);
});

test("a translation handed back unchanged is retried once, and the use is only counted once", async () => {
  let n = 0;
  const calls = model(() => answer(JSON.stringify({ code: ++n === 1 ? "x = 1" : "let x = 1;" })));
  const data = await (await post("/translate", { code: "x = 1", language: "python", target: "javascript" })).json();
  expect(data).toEqual({ code: "let x = 1;", language: "javascript", reviews_left: 2 });
  expect(calls.length).toBe(2);
  expect(calls[1].body.messages[1].content).toContain("still Python");
  expect(rows.usage.user_1).toBe(1);
});

test("a translation that stays unchanged after the retry is refused and costs nothing", async () => {
  const calls = model(() => answer('{"code": "x  =  1"}'));
  const res = await post("/translate", { code: "x = 1", language: "python", target: "javascript" });
  expect([res.status, (await res.json()).detail]).toEqual([502, "translation_unchanged"]);
  expect(calls.length).toBe(2);
  expect(rows.usage.user_1).toBe(0);
});

test("flowchart returns checked nodes and edges", async () => {
  model(() => answer(JSON.stringify({
    nodes: [{ id: "a", label: "start", kind: "start", line: 1 }, { id: "b", label: "x > 0?", kind: "weird", line: "2" }],
    edges: [{ from: "a", to: "b" }],
  })));
  const data = await (await post("/flowchart", { code: "x = 1" })).json();
  expect(data.nodes).toEqual([{ id: "a", label: "start", kind: "start", line: 1 }, { id: "b", label: "x > 0?", kind: "process", line: 2 }]);
  expect(data.edges).toEqual([{ from: "a", to: "b", label: "" }]);
  expect(data.reviews_left).toBe(2);
});

test("a flowchart edge to a missing node is malformed output", async () => {
  model(() => answer('{"nodes":[{"id":"a","label":"s","kind":"start"}],"edges":[{"from":"a","to":"zzz"}]}'));
  const res = await post("/flowchart", { code: "x = 1" });
  expect([res.status, (await res.json()).detail]).toEqual([502, "malformed_model_output"]);
  expect(rows.usage.user_1).toBe(0);
});

test.each(["/translate", "/flowchart"])("%s needs a signed-in user", async path => {
  expect((await app.request(path, { method: "POST" }, env)).status).toBe(401);
});
