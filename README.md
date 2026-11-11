# CodePilot AI

CodePilot is a browser-based code review workspace. Paste code or attach a
source file to get line-level findings, suggested fixes, and an optional
rewrite. You can also translate the code to another supported language,
generate a flowchart and download it as SVG, or revisit saved reviews.

The React frontend uses tree-sitter to check syntax before submitting a review.
A Cloudflare Worker serves the built site and the API, verifies Clerk sessions,
and calls a Qwen endpoint. Supabase stores review history and tracks usage.

## How it differs from the synopsis

The project synopsis lists Python, FastAPI and Docker for the application. What was built instead:

- **Backend:** TypeScript on a Cloudflare Worker (Hono), not Python and FastAPI. One Worker serves both the
  site and the API, which let the project be hosted for free with no server to run.
- **Python:** used for the evaluation scripts in `eval/`.
- **Tree-sitter:** runs in the browser as WebAssembly, so syntax is checked before a review is spent.
- **Docker:** runs the backup model (`compose.yaml`), not the application itself.

PostgreSQL (through Supabase), React and the LLM API are as the synopsis describes.

## Run locally on Windows

Install Git, Node.js 22.12 or newer, and Bun. In PowerShell, run each command
from the folder where you want the project. If you already cloned the repo
and entered its folder, start with `npm ci`.

```powershell
git clone https://github.com/akshit-sr/CodePilot-AI.git
cd CodePilot-AI
npm ci
```

Configure the services before building the site.

1. In a new Supabase project, apply
   [`0001_init.sql`](supabase/migrations/0001_init.sql) and then
   [`0002_three_hour_window.sql`](supabase/migrations/0002_three_hour_window.sql).
2. Put your Clerk publishable key in `frontend/.env` as
   `VITE_CLERK_PUBLISHABLE_KEY`.
3. Put `CLERK_SECRET_KEY` and `SUPABASE_SECRET_KEY` in `worker/.dev.vars`.
   Use the Clerk secret from the same instance as the publishable key.
4. Set `SUPABASE_URL`, `MODEL_URL`, and `MODEL_NAME` in
   [`worker/wrangler.toml`](worker/wrangler.toml) for your Supabase project and
   Qwen endpoint. `MODEL_URL` is the full OpenAI-compatible chat completions URL.

From the repository root, build the site and start the Worker.

```powershell
npm run build
cd worker
bun install --frozen-lockfile
bun run dev
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787) for the site and API.
See [RUN.md](RUN.md) for deployment, the optional Docker backup model, and
benchmark commands.

## Supported languages

The API accepts these case-insensitive language IDs.

| Language | ID | Language | ID |
| --- | --- | --- | --- |
| Python | `python` | C# | `csharp` |
| JavaScript | `javascript` | Go | `go` |
| TypeScript | `typescript` | Rust | `rust` |
| Java | `java` | PHP | `php` |
| C | `c` | Ruby | `ruby` |
| C++ | `cpp` | Kotlin | `kotlin` |

## Usage and history

Reviews, translations, and flowcharts draw from the same quota. The default is
50 model requests per user in each three-hour block, starting at 00:00, 03:00,
06:00 UTC, and so on. After a review, the browser starts preparing a flowchart
and a translation in the background. Each successful request counts toward
the quota. If a model request fails, the Worker attempts to return its use.

The Worker saves reviews with their submitted source. If saving fails, it
still returns the review with a null `id`. History lists the latest 50 saved
reviews for the signed-in user and lets that user delete individual entries.

## API

Authenticated requests use `Authorization: Bearer <Clerk session token>`.

| Method | Path | Sign-in | Result |
| --- | --- | --- | --- |
| GET | `/health` | No | Service status |
| GET | `/languages` | No | Supported language IDs and names |
| POST | `/review` | Yes | `findings`, `improved_code`, `id`, `reviews_left`, and `backup` (`null`, or the backup `model` that answered and the `reason`) |
| POST | `/translate` | Yes | Translated `code`, target `language`, and `reviews_left` |
| POST | `/flowchart` | Yes | `nodes`, `edges`, and `reviews_left` |
| GET | `/usage` | Yes | `limit`, `used`, `left`, and `resets_at` for the current window |
| GET | `/history` | Yes | Up to 50 reviews, newest first |
| GET | `/history/:id` | Yes | Full saved review |
| DELETE | `/history/:id` | Yes | `204 No Content` on successful deletion |

The three POST routes accept JSON with a nonempty `code` string up to 30,000
UTF-8 bytes, an optional `language` (default `python`), and an optional
`filename` (default `untitled`). Translation also requires a supported
`target` language ID.

```json
{ "code": "print('ok')", "language": "python", "filename": "main.py" }
```

Each review finding includes a type, a category (bug, security, performance, practice, readability, duplication, edge_case, or other), severity, 1-based line and column,
explanation, and suggested fix.

Errors use the JSON shape `{"detail":"<code>"}`.

| Status | Detail | Cause |
| --- | --- | --- |
| 401 | `sign_in_required` | Missing or invalid Clerk session token |
| 404 | `not_found` | Review ID is invalid or absent from the user's history |
| 413 | `code_too_large` | Source exceeds 30,000 UTF-8 bytes |
| 422 | `invalid_request` | Request body or field types are invalid |
| 422 | `unsupported_language` | Source or target language ID is unsupported |
| 429 | `daily_limit_reached` | The current three-hour quota is exhausted |
| 500 | `internal_error` | Unexpected server error |
| 502 | `malformed_model_output` | Model output failed validation |
| 502 | `translation_unchanged` | The model returned the source untranslated twice |
| 503 | `model_unavailable` | Model endpoint was unreachable or returned an error |
| 503 or 504 | `all_models_unavailable` | The primary model and the backup both failed |
| 503 | `database_unavailable` | Supabase request failed |
| 504 | `model_timeout` | Model request timed out |

## Configuration

Worker settings are in [`worker/wrangler.toml`](worker/wrangler.toml) under
`[vars]`.

| Variable | Purpose |
| --- | --- |
| `MODEL_URL` | Primary chat completions URL |
| `MODEL_NAME` | Primary model name |
| `MODEL_TIMEOUT_MS` | Timeout per model call in milliseconds (default 120,000) |
| `SUPABASE_URL` | Supabase project URL |
| `REVIEW_LIMIT` | Model requests allowed per user in a three-hour block (default 50) |
| `FALLBACK_MODEL_URL` | Optional backup chat completions URL |
| `FALLBACK_MODEL_NAME` | Backup model name |
| `FALLBACK_MODEL_TIMEOUT_MS` | Timeout per backup model call in milliseconds (default 600,000) |

Keep `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY`, and the optional
`FALLBACK_MODEL_KEY` in `worker/.dev.vars` for local development. For a
deployed Worker, set them with `bunx wrangler secret put`. The frontend
publishable key is included in the client build.

## Tests

With frontend and Worker dependencies installed, run these commands from the
repository root.

```powershell
bun test frontend
cd worker
bun test
```

The frontend suite covers syntax checks and review helpers. The Worker suite
mocks Clerk, Supabase, and the model. [GitHub Actions](.github/workflows/ci.yml)
builds the frontend and runs both suites. Successful pushes to `main` trigger
the Cloudflare deployment job.

## Project layout

| Path | Purpose |
| --- | --- |
| [`frontend/src/`](frontend/src/) | React workspace, syntax checks, and benchmark views |
| [`frontend/public/grammars/`](frontend/public/grammars/) | tree-sitter WebAssembly grammars |
| `frontend/dist/` | Built site served by the Worker |
| [`worker/src/index.ts`](worker/src/index.ts) | API, authentication, model calls, and usage accounting |
| [`supabase/migrations/`](supabase/migrations/) | Database schema and usage functions |
| [`eval/`](eval/) | Model evaluation scripts and datasets |
| [`compose.yaml`](compose.yaml) | Optional Docker backup model and tunnel |
| [`RUN.md`](RUN.md) | Setup, deployment, backup model, and evaluation details |

## License

[Apache 2.0](LICENSE)
