# Run and deploy CodePilot AI

The Cloudflare Worker serves both the built React app and the API. Clerk
handles sign-in, Supabase stores reviews and usage, and a Qwen endpoint runs
reviews, translations, and flowchart generation. See [README.md](README.md)
for the API and supported languages.

## One-time setup

Use PowerShell on Windows. Install Node.js 22.12 or newer and Bun, then run
these commands from the repository root.

```powershell
npm.cmd ci
cd worker
bun install --frozen-lockfile
cd ..
```

In your Supabase project's SQL editor, apply the migrations in order.

1. [`0001_init.sql`](supabase/migrations/0001_init.sql) creates the initial
   schema.
2. [`0002_three_hour_window.sql`](supabase/migrations/0002_three_hour_window.sql)
   updates usage tracking for three-hour windows.

If the initial migration is already applied, start with the second migration
if it is still pending.

Create `frontend/.env` with the Clerk publishable key. The frontend build
includes this value.

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

Create `worker/.dev.vars` with the corresponding Clerk secret and your
Supabase secret. Keep these values out of Git.

```dotenv
CLERK_SECRET_KEY=sk_...
SUPABASE_SECRET_KEY=sb_secret_...
```

Set `SUPABASE_URL`, `MODEL_NAME`, and `MODEL_URL` under `[vars]` in
[`worker/wrangler.toml`](worker/wrangler.toml). Use the Supabase project URL
and the full OpenAI-compatible chat completions URL for the Qwen model.

`REVIEW_LIMIT` defaults to 50 model requests per user per three-hour window.
Reviews, translations, and flowcharts share that quota. Windows reset at
00:00, 03:00, 06:00 UTC, and every three hours after that. `MODEL_TIMEOUT_MS`
sets the timeout per model call.

## Run locally

From the repository root, build the frontend and start the Worker.

```powershell
npm.cmd run build
cd worker
bun run dev
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787) and sign in to try a
review. In a second PowerShell window, you can check that the Worker responds.

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

The health endpoint checks that the Worker is running. Submitting a review
also exercises Clerk, Supabase, and the model endpoint.

For frontend hot reload, keep the Worker running and start
`npm.cmd run dev` from the repository root in a second terminal. Vite runs
at `http://127.0.0.1:5173`. Use the Worker URL on port 8787 to exercise
translation and flowcharts, since the current Vite proxy covers review,
history, usage, health, and language requests. If the Worker serves a 404
after a frontend rebuild, restart `bun run dev`.

## Deploy

From the repository root, enter `worker`, sign in to Cloudflare, and set the
deployed Worker's secrets. Use a matching pair of Clerk keys for the deployment
and set its publishable key in `frontend/.env` before building locally.

```powershell
cd worker
bunx wrangler login
bunx wrangler secret put CLERK_SECRET_KEY
bunx wrangler secret put SUPABASE_SECRET_KEY
bun run deploy
```

For subsequent manual deployments, run `bun run deploy` from `worker/`.
The command builds the frontend and uploads the Worker. Wrangler prints the
deployment URL. When the primary model tunnel URL changes, update
`MODEL_URL` and deploy again.

### Deploy from GitHub Actions

The [CI workflow](.github/workflows/ci.yml) deploys after checks pass on pushes
to `main`. In the repository's **Settings → Secrets and variables → Actions**,
configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository
secrets and `VITE_CLERK_PUBLISHABLE_KEY` as a repository variable. Set the
Clerk and Supabase runtime secrets on the Worker as shown above.

## Backup model (Docker)

The Worker tries the backup model when the primary model call fails and
`FALLBACK_MODEL_URL` is set. [`compose.yaml`](compose.yaml) runs a CPU-based
llama.cpp server configured for Qwen 3.5 9B, along with a Cloudflare quick
tunnel for deployed Workers.

Install Docker Desktop. From the repository root, copy
[`.env.example`](.env.example) to `.env`.

```powershell
Copy-Item .env.example .env
```

Edit `.env`. Set `MODEL_FILE` to the absolute path to your GGUF file and
`MODEL_API_KEY` to a long random value. Then start the containers and find
the tunnel URL.

```powershell
docker compose up -d
docker compose logs tunnel | Select-String trycloudflare.com
```

The tunnel starts after the model container passes its health check.

- For local development, put
  `FALLBACK_MODEL_URL=http://127.0.0.1:8080/v1/chat/completions` and
  `FALLBACK_MODEL_KEY=<MODEL_API_KEY>` in `worker/.dev.vars`, then restart
  Wrangler.
- For a deployed Worker, set `FALLBACK_MODEL_URL` in `worker/wrangler.toml`
  to the tunnel URL followed by `/v1/chat/completions`. Set
  `FALLBACK_MODEL_KEY` with `bunx wrangler secret put FALLBACK_MODEL_KEY`
  from `worker/`, using the same value as `MODEL_API_KEY`, and deploy.
  If the tunnel restarts, check its new URL and deploy with the updated value.

From the repository root, run `docker compose down` to stop both containers.

## Model evaluation (Python)

Install uv and use Python 3.11 or newer. The evaluation script reads the model
URLs and names from `worker/wrangler.toml`. It measures known bugs caught,
finding precision, and model response time. The app displays the generated
results at `/#eval`.

Run these commands from the repository root. The scoring tests run locally.
Evaluation requires the configured model endpoint to be reachable.

```powershell
cd eval
uv run pytest
uv run python run_eval.py --main-only
uv run python run_eval.py quixbugs --main-only --timeout=300
uv run python run_eval.py juliet --main-only --timeout=300
cd ..
npm.cmd run build
```

| Suite | Results in `frontend/public/` |
| --- | --- |
| Project test cases | `eval.json` |
| QuixBugs benchmark | `eval-quixbugs.json` |
| NIST Juliet benchmark | `eval-juliet.json` |

To include the backup model, configure `FALLBACK_MODEL_URL` and
`FALLBACK_MODEL_NAME` in `worker/wrangler.toml`, set
`$env:FALLBACK_MODEL_KEY` to the model API key in PowerShell, and omit
`--main-only`. The `--timeout` option sets the timeout in seconds. An
interrupted evaluation can resume from checkpoints in `eval/.progress/`.

The benchmark datasets are already in [`eval/datasets/`](eval/datasets/).
To regenerate them, run `uv run python fetch_quixbugs.py` or
`uv run python fetch_juliet.py` from `eval/`.
