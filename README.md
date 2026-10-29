# CodePilot AI Review Service

A code-review web app. You sign in, paste or attach a source file, and a Qwen
model returns structured findings (type, severity, line, column, explanation,
suggested fix) plus optional improved code, shown as notes in the margin.

It runs as one Cloudflare Worker that serves the React site and the API, with
Clerk for accounts and Supabase (PostgreSQL) for review history and daily limits.

## How it works

1. **Browser:** the code is syntax-checked with tree-sitter (WebAssembly grammars
   in `frontend/public/grammars/`). Broken code is stopped here, with a guess at
   the language it does parse as.
2. **Worker** (`worker/src/index.ts`), `POST /review`:
   - checks the Clerk session token (`401 sign_in_required` without one);
   - checks language and size;
   - counts the review against the user's daily limit in one atomic database
     call (`429 daily_limit_reached` once it is used up);
   - sends the code to the Qwen endpoint, or to the Docker backup model if that
     fails, and validates the JSON reply against a strict schema;
   - saves the review to the user's history and returns it with `reviews_left`.
   A failed model call gives the review back, so errors don't use up the limit.
3. **Supabase** holds `profiles`, `reviews` and `daily_usage`. Row-level security
   is on with no public policies, so only the Worker's secret key can read them.

## Supported languages

| `language` value | Language   | `language` value | Language |
| ---------------- | ---------- | ---------------- | -------- |
| `python`         | Python     | `csharp`         | C#       |
| `javascript`     | JavaScript | `go`             | Go       |
| `typescript`     | TypeScript | `rust`           | Rust     |
| `java`           | Java       | `php`            | PHP      |
| `c`              | C          | `ruby`           | Ruby     |
| `cpp`            | C++        | `kotlin`         | Kotlin   |

Values are case-insensitive. To add a language, add it to `LANGUAGES` in
`worker/src/index.ts`, its grammar to `frontend/public/grammars/`, and an
example to `frontend/src/samples.js`.

## Quick start

See [RUN.md](RUN.md) for keys, local runs and deploying.

```powershell
npm.cmd install; npm.cmd run build
cd worker; bun install; bun run dev    # http://127.0.0.1:8787
```

## Endpoints

| Method | Path           | Sign-in | Purpose                                   |
| ------ | -------------- | ------- | ----------------------------------------- |
| GET    | `/health`      | no      | Liveness check                            |
| GET    | `/languages`   | no      | Supported languages (id → name)           |
| POST   | `/review`      | yes     | Review a source file                      |
| GET    | `/usage`       | yes     | `{ limit, used, left }` for today (UTC)   |
| GET    | `/history`     | yes     | Your last 50 reviews (id, file, language, date) |
| GET    | `/history/:id` | yes     | One of your reviews in full               |

Signed-in requests send `Authorization: Bearer <Clerk session token>`. The
site itself is served as static files from `frontend/dist/`.

Request:

```json
{ "code": "print('ok')", "language": "python", "filename": "main.py" }
```

`language` defaults to `python` and `filename` is optional.

Response:

```json
{
  "findings": [
    { "type": "bug", "severity": "high", "line": 1, "column": 1, "explanation": "...", "suggested_fix": "..." }
  ],
  "improved_code": null,
  "id": "5f0c…",
  "reviews_left": 49
}
```

Errors are returned as `{"detail": "<code>"}`:

| Status | Detail                   | Cause                                    |
| ------ | ------------------------ | ---------------------------------------- |
| 401    | `sign_in_required`       | Missing or invalid Clerk session token   |
| 404    | `not_found`              | No such review in your history           |
| 413    | `code_too_large`         | Code is over 100 KB                      |
| 422    | `invalid_request`        | Missing or empty `code`, or bad types    |
| 422    | `unsupported_language`   | `language` is not in the list above      |
| 429    | `daily_limit_reached`    | Today's reviews are used up              |
| 502    | `malformed_model_output` | Model reply did not match the schema     |
| 503    | `model_unavailable`      | Model endpoint unreachable or errored    |
| 503    | `database_unavailable`   | Supabase unreachable or errored          |
| 504    | `model_timeout`          | Model did not answer in time             |

## Configuration

Plain settings live in `worker/wrangler.toml` under `[vars]`:

| Variable             | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `MODEL_URL`          | Qwen endpoint (OpenAI-compatible chat completions)   |
| `MODEL_NAME`         | Model name sent to it                                |
| `MODEL_TIMEOUT_MS`   | Per-call timeout, default `120000`                   |
| `SUPABASE_URL`       | Supabase project URL                                 |
| `DAILY_REVIEW_LIMIT` | Reviews per user per UTC day, default `50`           |
| `FALLBACK_MODEL_URL` | Backup model URL (Docker + tunnel); empty = no backup |
| `FALLBACK_MODEL_NAME`| Backup model name, `qwen3.5-9b`                      |

Secrets, never in Git: `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY` and
`FALLBACK_MODEL_KEY` (`bunx wrangler secret put`, or `worker/.dev.vars`
locally). The frontend reads `VITE_CLERK_PUBLISHABLE_KEY` from `frontend/.env`.
The Docker backup model reads `MODEL_FILE` and `MODEL_API_KEY` from `.env`
(see `.env.example` and [RUN.md](RUN.md#backup-model-docker)).

## Tests

```powershell
bun test frontend           # browser syntax check, all 12 grammars
cd worker; bun test         # Worker API; Clerk, Supabase and the model are mocked
```

CI (`.github/workflows/ci.yml`) runs both plus `npm run build` on pull
requests to `main` and on pushes to `main` and `feat/**`.

## Project layout

| Path                         | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| `worker/src/index.ts`        | Worker API: auth, limits, model call, history   |
| `worker/wrangler.toml`       | Worker settings, including `MODEL_URL`          |
| `supabase/migrations/`       | Database schema                                 |
| `frontend/src/main.jsx`      | Review workspace and hash routes                |
| `frontend/src/Auth.jsx`      | Clerk sign-in / sign-up pages                   |
| `frontend/src/Landing.jsx`   | Home page                                       |
| `frontend/src/syntax.js`     | Browser syntax check and language guess         |
| `frontend/public/grammars/`  | tree-sitter grammars (WebAssembly)              |
| `frontend/dist/`             | Built site, served by the Worker (committed)    |
| `vite.config.mjs`            | Vite config (root, dev forwarding, build output)|
| `.github/workflows/ci.yml`   | CI                                              |
| `compose.yaml`, `.env.example` | Docker backup model and its tunnel            |
| `RUN.md`                     | Keys, local runs, deploying, backup model       |
