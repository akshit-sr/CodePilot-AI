import { Hono, type MiddlewareHandler } from "hono";
import { verifyToken } from "@clerk/backend";

export const LANGUAGES: Record<string, string> = {
  python: "Python", javascript: "JavaScript", typescript: "TypeScript", java: "Java", c: "C", cpp: "C++",
  csharp: "C#", go: "Go", rust: "Rust", php: "PHP", ruby: "Ruby", kotlin: "Kotlin",
};
const MAX_CODE_SIZE = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Plain settings live in wrangler.toml [vars]; CLERK_SECRET_KEY, SUPABASE_SECRET_KEY and FALLBACK_MODEL_KEY are secrets
// (`wrangler secret put`, or .dev.vars locally). The fallback is the Docker backup model (compose.yaml).
export type Env = {
  MODEL_URL: string; MODEL_NAME: string; MODEL_TIMEOUT_MS?: string; FALLBACK_MODEL_URL?: string; FALLBACK_MODEL_NAME?: string; FALLBACK_MODEL_KEY?: string;
  SUPABASE_URL: string; SUPABASE_SECRET_KEY: string; CLERK_SECRET_KEY: string; DAILY_REVIEW_LIMIT?: string;
};
type Finding = { type: string; severity: string; line: number; column: number; explanation: string; suggested_fix: string };
type Review = { findings: Finding[]; improved_code: string | null };

class ApiError extends Error {
  constructor(readonly status: number, readonly detail: string) { super(detail); }
}

const prompt = (code: string, language: string, filename: string) => `Review this ${LANGUAGES[language]} source file (${filename}). Return only valid JSON matching this schema:
{"findings":[{"type":"string","severity":"low|medium|high|critical","line":1,"column":1,"explanation":"string","suggested_fix":"string"}],"improved_code":"string or null"}
Report actionable bugs, security issues, and maintainability problems. Use 1-based line and column numbers.

SOURCE:
\`\`\`${language}
${code}
\`\`\``;

// The model's JSON must have exactly findings (+ optional improved_code), each finding fully filled in.
function parseReview(content: unknown): Review {
  const out = JSON.parse(content as string);
  const int = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? +v : NaN;
  const str = (v: unknown) => { if (typeof v !== "string") throw TypeError(); return v; };
  if (!out || typeof out !== "object" || !Array.isArray(out.findings) || Object.keys(out).some(k => k !== "findings" && k !== "improved_code")) throw TypeError();
  if (out.improved_code != null) str(out.improved_code);
  const findings = out.findings.map((f: any) => {
    const line = int(f?.line), column = int(f?.column);
    if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) throw TypeError();
    return { type: str(f.type), severity: str(f.severity), line, column, explanation: str(f.explanation), suggested_fix: str(f.suggested_fix) };
  });
  return { findings, improved_code: out.improved_code ?? null };
}

async function callModel(url: string, model: string, timeoutMs: number, code: string, language: string, filename: string, key?: string): Promise<Review> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key && { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: "You are a precise code reviewer." }, { role: "user", content: prompt(code, language, filename) }],
        temperature: 0,
        reasoning_effort: "none",
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ApiError((e as Error)?.name === "TimeoutError" ? 504 : 503, (e as Error)?.name === "TimeoutError" ? "model_timeout" : "model_unavailable");
  }
  if (!response.ok) throw new ApiError(503, "model_unavailable");
  try {
    return parseReview(((await response.json()) as any).choices[0].message.content);
  } catch {
    throw new ApiError(502, "malformed_model_output");
  }
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
const today = () => new Date().toISOString().slice(0, 10);

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

app.post("/review", signedIn, async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.code !== "string" || !body.code || (body.language != null && typeof body.language !== "string") || (body.filename != null && typeof body.filename !== "string"))
    throw new ApiError(422, "invalid_request");
  const language = (body.language ?? "python").toLowerCase(), filename = body.filename || "untitled";
  if (!Object.hasOwn(LANGUAGES, language)) throw new ApiError(422, "unsupported_language");
  if (new TextEncoder().encode(body.code).length > MAX_CODE_SIZE) throw new ApiError(413, "code_too_large");

  const env = c.env, user = c.get("user"), timeout = Number(env.MODEL_TIMEOUT_MS || 120_000);
  const left = await rpc(env, "take_review", { p_user: user, p_limit: Number(env.DAILY_REVIEW_LIMIT || 50) }) as number;
  if (left < 0) throw new ApiError(429, "daily_limit_reached");

  let review: Review;
  try {
    review = await callModel(env.MODEL_URL, env.MODEL_NAME, timeout, body.code, language, filename).catch(e => {
      if (!(e instanceof ApiError) || !env.FALLBACK_MODEL_URL) throw e;
      console.warn(`primary model ${env.MODEL_NAME} failed (${e.detail}); FALLING BACK to ${env.FALLBACK_MODEL_NAME}`);
      return callModel(env.FALLBACK_MODEL_URL, env.FALLBACK_MODEL_NAME ?? env.MODEL_NAME, timeout, body.code, language, filename, env.FALLBACK_MODEL_KEY);
    });
  } catch (e) {
    await rpc(env, "return_review", { p_user: user }).catch(() => {});
    throw e;
  }

  // A review that can't be saved is still returned; it just won't show up in history.
  const saved = await db(env, "reviews?select=id", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: user, filename, language, code: body.code, ...review }),
  }).catch(() => null) as { id: string }[] | null;
  return c.json({ ...review, id: saved?.[0]?.id ?? null, reviews_left: left });
});

app.get("/usage", signedIn, async c => {
  const rows = await db(c.env, `daily_usage?select=reviews&user_id=eq.${encodeURIComponent(c.get("user"))}&day=eq.${today()}`) as { reviews: number }[];
  const limit = Number(c.env.DAILY_REVIEW_LIMIT || 50);
  return c.json({ limit, used: rows[0]?.reviews ?? 0, left: Math.max(limit - (rows[0]?.reviews ?? 0), 0) });
});

app.get("/history", signedIn, async c =>
  c.json(await db(c.env, `reviews?select=id,filename,language,created_at&user_id=eq.${encodeURIComponent(c.get("user"))}&order=created_at.desc&limit=50`)));

app.get("/history/:id", signedIn, async c => {
  const id = c.req.param("id");
  const rows = UUID.test(id) ? await db(c.env, `reviews?select=*&id=eq.${id}&user_id=eq.${encodeURIComponent(c.get("user"))}`) as object[] : [];
  if (!rows.length) throw new ApiError(404, "not_found");
  return c.json(rows[0]);
});

app.onError((e, c) => {
  if (e instanceof ApiError) return c.json({ detail: e.detail }, e.status as 400);
  console.error(e);
  return c.json({ detail: "internal_error" }, 500);
});

export default app;
