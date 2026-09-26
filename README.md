# CodePilot AI Review Service

```powershell
uv sync
uv run uvicorn app:app --reload
```

The service serves the review page at `/`, plus `GET /health`, `POST /review`,
and OpenAPI docs at `/docs`.
The separately running llama-server endpoint defaults to
`http://127.0.0.1:8080/v1/chat/completions`.

Configuration uses the `CODEPILOT_` prefix, for example
`CODEPILOT_MODEL_URL`, `CODEPILOT_MODEL_TIMEOUT_SECONDS`, and
`CODEPILOT_MAX_CODE_SIZE`.

For a persistent public URL from your own computer, see [RUN.md](RUN.md).

