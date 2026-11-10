import { Hono, type Context, type MiddlewareHandler } from "hono";
import { verifyToken } from "@clerk/backend";

export const LANGUAGES: Record<string, string> = {
  python: "Python", javascript: "JavaScript", typescript: "TypeScript", java: "Java", c: "C", cpp: "C++",
  csharp: "C#", go: "Go", rust: "Rust", php: "PHP", ruby: "Ruby", kotlin: "Kotlin",
};
const MAX_CODE_SIZE = 30_000;   // ~20k tokens: the 27B model reads ~250 tokens/s and Cloudflare tunnels drop after ~100s of silence
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Plain settings live in wrangler.toml [vars]; CLERK_SECRET_KEY, SUPABASE_SECRET_KEY and FALLBACK_MODEL_KEY are secrets
// (`wrangler secret put`, or .dev.vars locally). The fallback is the Docker backup model (compose.yaml).
export type Env = {
  MODEL_URL: string; MODEL_NAME: string; MODEL_TIMEOUT_MS?: string; FALLBACK_MODEL_TIMEOUT_MS?: string; FALLBACK_MODEL_URL?: string; FALLBACK_MODEL_NAME?: string; FALLBACK_MODEL_KEY?: string;
  SUPABASE_URL: string; SUPABASE_SECRET_KEY: string; CLERK_SECRET_KEY: string; REVIEW_LIMIT?: string;
};
type Finding = { type: string; severity: string; line: number; column: number; explanation: string; suggested_fix: string };
type Review = { findings: Finding[]; improved_code: string | null };

class ApiError extends Error {
  constructor(readonly status: number, readonly detail: string) { super(detail); }
}

const prompt = (code: string, language: string, filename: string) => `Review this ${LANGUAGES[language]} source file (${filename}). Return only valid JSON matching this schema:
{"findings":[{"type":"string","severity":"low|medium|high|critical","line":1,"column":1,"explanation":"string","suggested_fix":"string"}],"improved_code":"string or null"}
Report actionable bugs, security issues, and maintainability problems. "type" is a short title for the problem, e.g. "SQL injection".
Each source line below starts with its line number and "| "; use that number for "line". The numbers are not part of the code: leave them out of improved_code.
Leave every comment exactly as written: in improved_code keep each one word for word, and do not suggest changes to comments.

SOURCE:
\`\`\`${language}
${code.split("\n").map((line, i) => `${i + 1}| ${line}`).join("\n")}
\`\`\``;

// The model's JSON must have exactly findings (+ optional improved_code), each finding fully filled in.
const int = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? +v : NaN;
const str = (v: unknown) => { if (typeof v !== "string") throw TypeError(); return v; };
function parseReview(content: unknown): Review {
  const out = JSON.parse(content as string);
  if (!out || typeof out !== "object" || !Array.isArray(out.findings) || Object.keys(out).some(k => k !== "findings" && k !== "improved_code")) throw TypeError();
  if (out.improved_code != null) str(out.improved_code);
  const findings = out.findings.map((f: any) => {
    const line = int(f?.line), column = int(f?.column);
    if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) throw TypeError();
    return { type: str(f.type), severity: str(f.severity), line, column, explanation: str(f.explanation), suggested_fix: str(f.suggested_fix) };
  });
  return { findings, improved_code: out.improved_code ?? null };
}

const parseTranslation = (content: unknown) => {
  const code = JSON.parse(content as string)?.code;
  if (typeof code !== "string" || !code.trim()) throw TypeError();
  return code;
};

// A flowchart as plain data; the browser turns it into a diagram, so the model never writes diagram syntax.
const KINDS = ["start", "process", "decision", "end"];
function parseFlowchart(content: unknown) {
  const out = JSON.parse(content as string);
  if (!Array.isArray(out?.nodes) || !Array.isArray(out.edges) || !out.nodes.length || out.nodes.length > 40 || out.edges.length > 80) throw TypeError();
  const nodes = out.nodes.map((n: any) => ({ id: str(n.id), label: str(n.label).slice(0, 80), kind: KINDS.includes(n.kind) ? n.kind : "process", line: int(n.line) >= 1 ? int(n.line) : null }));
  const ids = new Set(nodes.map((n: { id: string }) => n.id));
  const edges = out.edges.map((e: any) => {
    if (!ids.has(e?.from) || !ids.has(e.to)) throw TypeError();
    return { from: e.from, to: e.to, label: typeof e.label === "string" ? e.label.slice(0, 40) : "" };
  });
  return { nodes, edges };
}

const messages = (task: string) => [{ role: "system", content: "You are a precise code assistant. Reply with JSON only." }, { role: "user", content: task }];
const source = (code: string, language: string) => `\n\nSOURCE:\n\`\`\`${language}\n${code}\n\`\`\``;
const translatePrompt = (code: string, from: string, to: string, retry = false) => messages(`Rewrite this ${LANGUAGES[from]} code as ${LANGUAGES[to]} code. The result must be valid ${LANGUAGES[to]}, written in ${LANGUAGES[to]} syntax, and must not be ${LANGUAGES[from]}. Keep the behaviour, names and comments. Return only JSON: {"language":"${LANGUAGES[to]}","code":"the full ${LANGUAGES[to]} source"}`
  + (retry ? ` Your previous answer was still ${LANGUAGES[from]}. This time write real ${LANGUAGES[to]}.` : "") + source(code, from));
// Small models sometimes hand the source back untouched; compare ignoring whitespace.
const unchanged = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
const flowchartPrompt = (code: string, language: string) => messages(`Draw a flowchart of the main logic of this ${LANGUAGES[language]} code. Return only JSON:
{"nodes":[{"id":"a","label":"short text","kind":"start|process|decision|end","line":1}],"edges":[{"from":"a","to":"b","label":"yes/no or empty"}]}
Use at most 25 nodes. "line" is the 1-based source line the node comes from. Decision nodes have labelled outgoing edges.` + source(code, language));

// Joins the pieces of a streamed answer ("data: {...}" lines) back into one string.
async function readStream(response: Response) {
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  let buf = "", text = "";
  const take = (line: string) => {
    const data = line.replace(/\r$/, "").match(/^data: (.+)$/)?.[1];
    if (data && data !== "[DONE]") text += JSON.parse(data).choices?.[0]?.delta?.content ?? "";
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = (buf += decoder.decode(value, { stream: true })).split("\n");
    buf = lines.pop()!;
    lines.forEach(take);
  }
  take(buf);
  return text;
}

async function callModel<T>(url: string, model: string, timeoutMs: number, msgs: object[], parse: (content: unknown) => T, key?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key && { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify({
        model,
        messages: msgs,
        temperature: 0,
        reasoning_effort: "none",
        response_format: { type: "json_object" },
        stream: true,   // a steady trickle of text keeps a slow model's tunnel from timing out
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ApiError((e as Error)?.name === "TimeoutError" ? 504 : 503, (e as Error)?.name === "TimeoutError" ? "model_timeout" : "model_unavailable");
  }
  if (!response.ok) { console.error("model", url, "answered", response.status); throw new ApiError(503, "model_unavailable"); }
  const plain = response.headers.get("content-type")?.includes("json");   // a server that ignored stream:true
  let text: any;
  try {
    text = plain ? await response.json().catch(() => null) : await readStream(response);
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError";
    throw new ApiError(timedOut ? 504 : 503, timedOut ? "model_timeout" : "model_unavailable");
  }
  try {
    return parse(plain ? text.choices[0].message.content : text);
  } catch {
    throw new ApiError(502, "malformed_model_output");
  }
}

// Primary model first, then the backup if one is configured. `backup` says which model answered instead, and why.
type Backup = { model: string; reason: string } | null;
function ask<T>(env: Env, msgs: object[], parse: (content: unknown) => T): Promise<{ out: T; backup: Backup }> {
  const timeout = Number(env.MODEL_TIMEOUT_MS || 120_000), slowTimeout = Number(env.FALLBACK_MODEL_TIMEOUT_MS || 600_000);
  return callModel(env.MODEL_URL, env.MODEL_NAME, timeout, msgs, parse).then(out => ({ out, backup: null as Backup })).catch(e => {
    if (!(e instanceof ApiError) || !env.FALLBACK_MODEL_URL) throw e;
    console.warn(`primary model ${env.MODEL_NAME} failed (${e.detail}); FALLING BACK to ${env.FALLBACK_MODEL_NAME}`);
    const model = env.FALLBACK_MODEL_NAME ?? env.MODEL_NAME;
    return callModel(env.FALLBACK_MODEL_URL, model, slowTimeout, msgs, parse, env.FALLBACK_MODEL_KEY).then(out => ({ out, backup: { model, reason: e.detail } }))
      .catch(e2 => { throw e2 instanceof ApiError && e2.detail !== "malformed_model_output" ? new ApiError(e2.status, "all_models_unavailable") : e2; });
  });
}

// Supabase's REST API, called with the secret key (the tables have RLS on and no public policies).
async function db(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json", ...init.headers },
  }).catch(() => null);
  if (!response?.ok) {
    console.error("supabase", path, response?.status, await response?.text().catch(() => ""));
    throw new ApiError(503, "database_unavailable");
  }
  return response.status === 204 ? null : response.json();
}
const rpc = (env: Env, fn: string, args: object) => db(env, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
const WINDOW_MS = 3 * 3600_000;   // usage resets every 3 hours, on the 00/03/06... UTC boundaries
const windowStart = () => Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;

type Vars = { user: string };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// Every route below needs a signed-in Clerk user: `Authorization: Bearer <session token>`.
const signedIn: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const token = c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  const claims = token && await verifyToken(token, { secretKey: c.env.CLERK_SECRET_KEY }).catch(() => null);
  if (!claims?.sub) throw new ApiError(401, "sign_in_required");
  c.set("user", claims.sub);
  await next();
};

app.get("/health", c => c.json({ status: "ok" }));
app.get("/languages", c => c.json(LANGUAGES));

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

// The JSON body every model route takes: code plus an optional language and filename.
async function codeRequest(c: Ctx) {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.code !== "string" || !body.code || (body.language != null && typeof body.language !== "string") || (body.filename != null && typeof body.filename !== "string"))
    throw new ApiError(422, "invalid_request");
  const language = (body.language ?? "python").toLowerCase(), filename = body.filename || "untitled";
  if (!Object.hasOwn(LANGUAGES, language)) throw new ApiError(422, "unsupported_language");
  if (new TextEncoder().encode(body.code).length > MAX_CODE_SIZE) throw new ApiError(413, "code_too_large");
  return { body, code: body.code as string, language, filename: filename as string };
}

// Counts one use against the user's window, runs the model, and gives the use back if the model failed.
async function metered<T>(c: Ctx, msgs: object[], parse: (content: unknown) => T) {
  const env = c.env, user = c.get("user");
  const left = await rpc(env, "take_review", { p_user: user, p_limit: Number(env.REVIEW_LIMIT || 50) }) as number;
  if (left < 0) throw new ApiError(429, "daily_limit_reached");
  try {
    return { ...await ask(env, msgs, parse), left };
  } catch (e) {
    await rpc(env, "return_review", { p_user: user }).catch(() => {});
    throw e;
  }
}

app.post("/review", signedIn, async c => {
  const { code, language, filename } = await codeRequest(c);
  const { out: review, left, backup } = await metered(c, [{ role: "system", content: "You are a precise code reviewer." }, { role: "user", content: prompt(code, language, filename) }], parseReview);
  const env = c.env, user = c.get("user");

  // A review that can't be saved is still returned; it just won't show up in history.
  const saved = await db(env, "reviews?select=id", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: user, filename, language, code, ...review }),
  }).catch(() => null) as { id: string }[] | null;
  return c.json({ ...review, id: saved?.[0]?.id ?? null, reviews_left: left, backup });
});

app.post("/translate", signedIn, async c => {
  const { body, code, language } = await codeRequest(c);
  const target = typeof body.target === "string" ? body.target.toLowerCase() : "";
  if (!Object.hasOwn(LANGUAGES, target)) throw new ApiError(422, "unsupported_language");
  let attempt = await metered(c, translatePrompt(code, language, target), parseTranslation);
  if (language !== target && unchanged(attempt.out, code)) {
    // Give that use back and ask once more, firmly; if it's still untouched, say so instead of showing the same code.
    const giveBack = () => rpc(c.env, "return_review", { p_user: c.get("user") }).catch(() => {});
    await giveBack();
    attempt = await metered(c, translatePrompt(code, language, target, true), parseTranslation);
    if (unchanged(attempt.out, code)) { await giveBack(); throw new ApiError(502, "translation_unchanged"); }
  }
  return c.json({ code: attempt.out, language: target, reviews_left: attempt.left });
});

app.post("/flowchart", signedIn, async c => {
  const { code, language } = await codeRequest(c);
  const { out, left } = await metered(c, flowchartPrompt(code, language), parseFlowchart);
  return c.json({ ...out, reviews_left: left });
});

app.get("/usage", signedIn, async c => {
  const start = encodeURIComponent(new Date(windowStart()).toISOString());
  const rows = await db(c.env, `usage_windows?select=reviews&user_id=eq.${encodeURIComponent(c.get("user"))}&window_start=eq.${start}`) as { reviews: number }[];
  const limit = Number(c.env.REVIEW_LIMIT || 50);
  return c.json({ limit, used: rows[0]?.reviews ?? 0, left: Math.max(limit - (rows[0]?.reviews ?? 0), 0), resets_at: new Date(windowStart() + WINDOW_MS).toISOString() });
});

app.get("/history", signedIn, async c =>
  c.json(await db(c.env, `reviews?select=id,filename,language,created_at&user_id=eq.${encodeURIComponent(c.get("user"))}&order=created_at.desc&limit=50`)));

app.get("/history/:id", signedIn, async c => {
  const id = c.req.param("id");
  const rows = UUID.test(id) ? await db(c.env, `reviews?select=*&id=eq.${id}&user_id=eq.${encodeURIComponent(c.get("user"))}`) as object[] : [];
  if (!rows.length) throw new ApiError(404, "not_found");
  return c.json(rows[0]);
});

app.delete("/history/:id", signedIn, async c => {
  const id = c.req.param("id");
  const rows = UUID.test(id) ? await db(c.env, `reviews?id=eq.${id}&user_id=eq.${encodeURIComponent(c.get("user"))}`, { method: "DELETE", headers: { Prefer: "return=representation" } }) as object[] : [];
  if (!rows.length) throw new ApiError(404, "not_found");
  return c.body(null, 204);
});

app.onError((e, c) => {
  if (e instanceof ApiError) return c.json({ detail: e.detail }, e.status as 400);
  console.error(e);
  return c.json({ detail: "internal_error" }, 500);
});

export default app;
