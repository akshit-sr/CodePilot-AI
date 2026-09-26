# Run with the local Qwen model

```powershell
uv sync
.\start.ps1
```

The npm `cloudflared` package must be installed once with `npm.cmd install`.
If npm blocks its install script, `start.ps1` downloads the executable on its
first run. Do not run `npm.cmd ci` while the tunnel is running; Windows locks
the executable. After installation, no npm command is needed to start it.

`start.ps1` starts the local Qwen model and FastAPI service, waits for both to
be ready, then prints a public `https://...trycloudflare.com` URL. Open that
URL to use the frontend; its `/review` request goes back through the same
tunnel to FastAPI on port 8000. Keep both PowerShell windows open while using
the demo. The quick URL changes each time and is public to anyone who has it.

`run_service.py` starts:

- `F:\llama\llama-b10331-bin-win-vulkan-x64\llama-server.exe`
- `F:\llama\llama_cache\models--unsloth--qwen3.5-9B-GGUF\snapshots\3885219b6810b007914f3a7950a8d1b469d598a5\Qwen3.5-9B-Q4_K_M.gguf`
- the FastAPI service at `http://127.0.0.1:8000`

Override paths with `CODEPILOT_LLAMA_SERVER_EXE` and `CODEPILOT_MODEL_PATH`.

## Publish the review page through Cloudflare

The page at `/` sends `POST /review` to the same origin. Keep the FastAPI and
Qwen ports bound to `127.0.0.1`; publish only port 8000 through a named
Cloudflare Tunnel for a stable hostname. The older `test-fd/frontend_server.py`
is not needed.

1. Have an active domain in Cloudflare. In **Zero Trust > Access controls >
   Applications**, create a self-hosted application for the hostname you will
   use, such as `review.example.com`. Add an Allow policy for the people who
   may use it. Do this before publishing the hostname.
2. Run `npm.cmd install` once in this repo. This installs the npm `cloudflared`
   wrapper and Cloudflare's Windows binary. In
   **Networking > Tunnels**, create a remotely managed tunnel and copy its
   token. Keep the token out of Git.
3. Add a **Published application** route: hostname `review.example.com`,
   service URL `http://127.0.0.1:8000`. Enable **Protect with Access** for the
   route so `cloudflared` validates Access tokens.
4. Set `$env:TUNNEL_TOKEN = '<token>'`, then run `.\start.ps1`. It will use the
   named tunnel instead of a quick tunnel. Check
   `Invoke-RestMethod http://127.0.0.1:8000/health`, then open
   `https://review.example.com/` and sign in through Access. Submit a short
   Python snippet to check the full review path; `/health` only checks the API.

The computer, model process, and tunnel connector must remain running. The
public hostname stays the same across restarts, but the app is unavailable
while the computer is off. Do not add the model's port 8080 as a public route.
For automatic tunnel startup after a reboot, install the connector as a
Windows service using Cloudflare's dashboard instructions; the model and API
must also be started separately.
