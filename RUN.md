# Run with the local Qwen model

```powershell
uv sync
uv run python run_service.py
```

`run_service.py` starts:

- `F:\llama\llama-b10331-bin-vulkan-x64\llama-server.exe`
- `F:\llama\llama_cache\models--unsloth--qwen3.5-9B-GGUF\snapshots\3885219b6810b007914f3a7950a8d1b469d598a5\Qwen3.5-9B-Q4_K_M.gguf`
- the FastAPI service at `http://127.0.0.1:8000`

Override paths with `CODEPILOT_LLAMA_SERVER_EXE` and `CODEPILOT_MODEL_PATH`.
