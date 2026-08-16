from __future__ import annotations

import os
import subprocess
from pathlib import Path

import uvicorn


SERVER = Path(os.getenv("CODEPILOT_LLAMA_SERVER_EXE", r"F:\llama\llama-b10331-bin-win-vulkan-x64\llama-server.exe"))
MODEL = Path(os.getenv("CODEPILOT_MODEL_PATH", r"F:\llama\llama_cache\models--unsloth--qwen3.5-9B-GGUF\snapshots\3885219b6810b007914f3a7950a8d1b469d598a5\Qwen3.5-9B-Q4_K_M.gguf"))
MODEL_HOST = os.getenv("CODEPILOT_MODEL_HOST", "127.0.0.1")
MODEL_PORT = os.getenv("CODEPILOT_MODEL_PORT", "8080")


def main() -> None:
    if not SERVER.is_file():
        raise SystemExit(f"llama-server.exe not found: {SERVER}")
    if not MODEL.is_file():
        raise SystemExit(f"model file not found: {MODEL}")
    process = subprocess.Popen([str(SERVER), "-m", str(MODEL), "--host", MODEL_HOST, "--port", MODEL_PORT, "--jinja"])
    try:
        uvicorn.run("app:app", host="127.0.0.1", port=8000)
    finally:
        process.terminate()
        process.wait(timeout=10)


if __name__ == "__main__":
    main()
