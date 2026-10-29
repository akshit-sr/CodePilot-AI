# Run and deploy

CodePilot runs as one Cloudflare Worker (`worker/`) that serves the built React
site and the API. Sign-in is Clerk, data is Supabase, reviews come from the
Qwen endpoint in `worker/wrangler.toml`.

## One-time setup

1. Install: `npm.cmd install` in the repo root, `bun install` in `worker/`.
2. Supabase: run `supabase/migrations/0001_init.sql` once in the project's SQL
   editor (already done for `kznbombadogwizvsruep`).
3. Keys, all kept out of Git:
   - `frontend/.env`: `VITE_CLERK_PUBLISHABLE_KEY=pk_...` (Clerk -> API keys).
     It is public and ends up in the built site; that is expected.
   - `worker/.dev.vars`, for local runs:
     ```
     CLERK_SECRET_KEY=sk_...
     SUPABASE_SECRET_KEY=sb_secret_...
     ```

## Run locally

```powershell
npm.cmd run build          # build the site into frontend/dist
cd worker; bun run dev     # site + API on http://127.0.0.1:8787
```

For frontend work, also run `npm.cmd run dev` (http://127.0.0.1:5173, hot
reload; API calls go to the Worker on 8787). Restart `bun run dev` after a
`npm.cmd run build`, or it serves 404 for the page.

## Deploy

First time only:

```powershell
cd worker
bunx wrangler login                               # opens the browser
bunx wrangler secret put CLERK_SECRET_KEY         # paste sk_...
bunx wrangler secret put SUPABASE_SECRET_KEY      # paste sb_secret_...
```

Every deploy:

```powershell
cd worker; bun run deploy    # builds the site, then uploads the Worker
```

The site is then at `https://codepilot.<your-subdomain>.workers.dev`.
Wrangler asks you to pick the subdomain on the first deploy.

When the Qwen tunnel URL changes, edit `MODEL_URL` in `worker/wrangler.toml`
and run `bun run deploy` again. Other settings there: `MODEL_NAME`,
`MODEL_TIMEOUT_MS`, `SUPABASE_URL`, `DAILY_REVIEW_LIMIT`.

### Clerk production keys

The deploy above uses Clerk's development keys, which work on any domain but
show a "Development mode" badge. Clerk's production instance needs a domain you
own. Once you have one: create the production instance in the Clerk dashboard,
put its `pk_live_...` in `frontend/.env`, run
`bunx wrangler secret put CLERK_SECRET_KEY` with its `sk_live_...`, and deploy.

## Backup model (Docker)

When the main Qwen endpoint fails, the Worker retries on a backup: Qwen 3.5 9B
running in Docker on this computer, reachable through a Cloudflare quick tunnel.

One-time: install Docker Desktop, copy `.env.example` to `.env`, set
`MODEL_FILE` to your `.gguf` file and `MODEL_API_KEY` to a long random string,
then give the Worker the same key:

```powershell
cd worker; bunx wrangler secret put FALLBACK_MODEL_KEY   # paste MODEL_API_KEY
```

Start it (from the repo root):

```powershell
docker compose up -d
docker compose logs tunnel | Select-String trycloudflare.com
```

Put that URL plus `/v1/chat/completions` in `FALLBACK_MODEL_URL` in
`worker/wrangler.toml`, then `cd worker; bun run deploy`. The quick-tunnel URL
changes whenever the tunnel container restarts; repeat this step then.

`docker compose down` stops it. The model runs on the CPU (Docker on Windows
can't use the Intel Arc GPU), so backup reviews are slow; the first start also
takes a minute or two to load the model. Locally the model is also at
`http://127.0.0.1:8080`, so `worker/.dev.vars` can use
`FALLBACK_MODEL_URL=http://127.0.0.1:8080/v1/chat/completions` plus
`FALLBACK_MODEL_KEY` for `bun run dev`.

Without the API key anyone with the tunnel URL could use the model; keep
`MODEL_API_KEY` set.
