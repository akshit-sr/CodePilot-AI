# CodePilot AI Review Service

A FastAPI service that reviews Python source code with a Qwen model and returns
structured findings (type, severity, line, column, explanation, suggested fix)
plus optional improved code. It ships with a single-page frontend and can be
published from your own computer through a Cloudflare Tunnel.

## How it works

1. `POST /review` validates the request: Python only, size limit, and a
   tree-sitter syntax check, so broken code is rejected before reaching a model.
2. The code is sent to the **primary** model (`qwen3.8-27b-uncensored-mtp`, a
   remote OpenAI-compatible endpoint).
3. If the primary fails for any reason (unreachable, timeout, malformed
   output), the service logs a warning and **falls back** to the **local**
   model (`qwen3.5-9b` on llama-server at `127.0.0.1:8080`).
4. The model's JSON reply is validated against a strict schema before it is
   returned.

## Quick start

```powershell
uv sync
uv run uvicorn app:app --reload
```

This starts only the API on `http://127.0.0.1:8000`; a model endpoint must
already be reachable. To start the local model, the API, and a public tunnel
together, use `.\start.ps1` — see [RUN.md](RUN.md).

## Endpoints

| Method | Path      | Purpose                         |
| ------ | --------- | ------------------------------- |
| GET    | `/`       | Review page (`frontend.html`)   |
| GET    | `/health` | Liveness check                  |
| POST   | `/review` | Review a Python source file     |
| GET    | `/docs`   | OpenAPI docs                    |

Request:

```json
{ "code": "print('ok')", "language": "python", "filename": "main.py" }
```

`language` defaults to `python` and `filename` is optional.

Response:

```json
{
  "findings": [
    {
      "type": "bug",
      "severity": "high",
      "line": 1,
      "column": 1,
      "explanation": "...",
      "suggested_fix": "..."
    }
  ],
  "improved_code": null
}
```

Errors are returned as `{"detail": "<code>"}`:

| Status | Detail                   | Cause                                  |
| ------ | ------------------------ | -------------------------------------- |
| 400    | `syntax_error`           | Code does not parse as Python          |
| 413    | `code_too_large`         | Code exceeds `CODEPILOT_MAX_CODE_SIZE` |
| 422    | `unsupported_language`   | `language` is not `python`             |
| 502    | `malformed_model_output` | Model reply did not match the schema   |
| 503    | `model_unavailable`      | Model endpoint unreachable or errored  |
| 504    | `model_timeout`          | Model did not answer in time           |

The 5xx codes describe the local fallback model, since it is tried last.

## Configuration

Settings use the `CODEPILOT_` prefix and can be set in the environment or in
`.env` (see `.env.example`).

| Variable                          | Default                                      |
| --------------------------------- | -------------------------------------------- |
| `CODEPILOT_PRIMARY_MODEL_URL`     | a `trycloudflare.com` quick-tunnel URL       |
| `CODEPILOT_PRIMARY_MODEL_NAME`    | `qwen3.8-27b-uncensored-mtp:latest`          |
| `CODEPILOT_MODEL_URL`             | `http://127.0.0.1:8080/v1/chat/completions`  |
| `CODEPILOT_MODEL_NAME`            | `qwen3.5-9b`                                 |
| `CODEPILOT_MODEL_TIMEOUT_SECONDS` | `120` (`start.ps1` sets `900`)               |
| `CODEPILOT_MAX_CODE_SIZE`         | `100000` bytes                               |
| `CODEPILOT_HOST` / `CODEPILOT_PORT` | `127.0.0.1` / `8000`                       |

The default primary URL is a quick tunnel, which changes every time that tunnel
restarts. Set `CODEPILOT_PRIMARY_MODEL_URL` to the current one, otherwise every
review falls back to the local model. The timeout applies per model, so a
hanging primary delays the fallback by that long.

`run_service.py` and `start.ps1` also read `CODEPILOT_LLAMA_SERVER_EXE`,
`CODEPILOT_MODEL_PATH`, `CODEPILOT_MODEL_HOST`, and `CODEPILOT_MODEL_PORT` for
the local llama-server.

## Tests

```powershell
uv run pytest
```

The tests mock the model endpoints, so no model needs to be running.

## Project layout

| File             | Purpose                                                     |
| ---------------- | ----------------------------------------------------------- |
| `app.py`         | FastAPI app, validation, model calls and fallback           |
| `frontend.html`  | Temporary review page served at `/`                         |
| `run_service.py` | Starts llama-server and the API together                    |
| `start.ps1`      | Starts everything and opens a Cloudflare tunnel             |
| `test_app.py`    | API tests                                                   |
| `RUN.md`         | Local model and Cloudflare Tunnel setup                     |
