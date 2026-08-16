from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from tree_sitter import Language, Parser
import tree_sitter_python


class Settings(BaseSettings):
    model_url: str = "http://127.0.0.1:8080/v1/chat/completions"
    model_timeout_seconds: float = 120.0
    max_code_size: int = 100_000
    host: str = "127.0.0.1"
    port: int = 8000
    model_name: str = "qwen3.5-9b"
    model_config = SettingsConfigDict(env_prefix="CODEPILOT_", env_file=".env")


class ReviewRequest(BaseModel):
    code: str = Field(min_length=1)
    language: str = "python"
    filename: str | None = None


class Finding(BaseModel):
    type: str
    severity: str
    line: int = Field(ge=1)
    column: int = Field(ge=1)
    explanation: str
    suggested_fix: str


class ReviewResponse(BaseModel):
    findings: list[Finding]
    improved_code: str | None = None


class ModelOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    findings: list[Finding]
    improved_code: str | None = None


app = FastAPI(title="CodePilot AI Review Service", version="0.1.0")
settings = Settings()
PYTHON = Language(tree_sitter_python.language())


def syntax_error(code: str) -> bool:
    parser = Parser(PYTHON)
    return parser.parse(code.encode()).root_node.has_error


def prompt_for(request: ReviewRequest) -> str:
    filename = request.filename or "untitled.py"
    return f"""Review this Python source file ({filename}). Return only valid JSON matching this schema:
{{"findings":[{{"type":"string","severity":"low|medium|high|critical","line":1,"column":1,"explanation":"string","suggested_fix":"string"}}],"improved_code":"string or null"}}
Report actionable bugs, security issues, and maintainability problems. Use 1-based line and column numbers.

SOURCE:
```python
{request.code}
```"""


async def call_model(request: ReviewRequest) -> ModelOutput:
    payload = {
        "model": settings.model_name,
        "messages": [
            {"role": "system", "content": "You are a precise code reviewer."},
            {"role": "user", "content": prompt_for(request)},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.model_timeout_seconds) as client:
            response = await client.post(settings.model_url, json=payload)
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "model_timeout") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(503, "model_unavailable") from exc
    try:
        content: Any = response.json()["choices"][0]["message"]["content"]
        return ModelOutput.model_validate(json.loads(content))
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(502, "malformed_model_output") from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/review", response_model=ReviewResponse)
async def review(request: ReviewRequest) -> ReviewResponse:
    if request.language.lower() != "python":
        raise HTTPException(422, "unsupported_language")
    if len(request.code.encode()) > settings.max_code_size:
        raise HTTPException(413, "code_too_large")
    if syntax_error(request.code):
        raise HTTPException(400, "syntax_error")
    return await call_model(request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)

