from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from tree_sitter_language_pack import get_parser

LANGUAGES = {
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "java": "Java",
    "c": "C",
    "cpp": "C++",
    "csharp": "C#",
    "go": "Go",
    "rust": "Rust",
    "php": "PHP",
    "ruby": "Ruby",
    "kotlin": "Kotlin",
}


class Settings(BaseSettings):
    primary_model_url: str = "https://aging-findarticles-hobby-affairs.trycloudflare.com/v1/chat/completions"
    primary_model_name: str = "qwen3.8-27b-uncensored-mtp:latest"
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


log = logging.getLogger("uvicorn.error")
app = FastAPI(title="CodePilot AI Review Service", version="0.1.0")
settings = Settings()
FRONTEND = Path(__file__).with_name("frontend.html")


def syntax_error(code: str, language: str) -> bool:
    return get_parser(language).parse(code.encode()).root_node.has_error


def prompt_for(request: ReviewRequest) -> str:
    filename = request.filename or "untitled"
    language = request.language.lower()
    return f"""Review this {LANGUAGES[language]} source file ({filename}). Return only valid JSON matching this schema:
{{"findings":[{{"type":"string","severity":"low|medium|high|critical","line":1,"column":1,"explanation":"string","suggested_fix":"string"}}],"improved_code":"string or null"}}
Report actionable bugs, security issues, and maintainability problems. Use 1-based line and column numbers.

SOURCE:
```{language}
{request.code}
```"""


async def call_model(request: ReviewRequest) -> ModelOutput:
    backends = [
        (settings.primary_model_url, settings.primary_model_name),
        (settings.model_url, settings.model_name),
    ]
    for url, name in backends[:-1]:
        try:
            result = await call_backend(request, url, name)
            log.info("served by primary model %s", name)
            return result
        except HTTPException as exc:
            log.warning("primary model %s failed (%s); FALLING BACK to local %s", name, exc.detail, backends[-1][1])
    return await call_backend(request, *backends[-1])


async def call_backend(request: ReviewRequest, url: str, model: str) -> ModelOutput:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a precise code reviewer."},
            {"role": "user", "content": prompt_for(request)},
        ],
        "temperature": 0,
        "reasoning_effort": "none",
        "response_format": {"type": "json_object"},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.model_timeout_seconds) as client:
            response = await client.post(url, json=payload)
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


@app.get("/", response_class=FileResponse)
def frontend() -> FileResponse:
    return FileResponse(FRONTEND)


@app.get("/languages")
def languages() -> dict[str, str]:
    return LANGUAGES


@app.post("/review", response_model=ReviewResponse)
async def review(request: ReviewRequest) -> ReviewResponse:
    if request.language.lower() not in LANGUAGES:
        raise HTTPException(422, "unsupported_language")
    if len(request.code.encode()) > settings.max_code_size:
        raise HTTPException(413, "code_too_large")
    if syntax_error(request.code, request.language.lower()):
        raise HTTPException(400, "syntax_error")
    return await call_model(request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)

