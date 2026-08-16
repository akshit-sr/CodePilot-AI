$env:CODEPILOT_LLAMA_SERVER_EXE = 'F:\llama\llama-b10331-bin-win-vulkan-x64\llama-server.exe'
$env:CODEPILOT_MODEL_PATH = 'F:\llama\llama_cache\models--unsloth--qwen3.5-9B-GGUF\snapshots\3885219b6810b007914f3a7950a8d1b469d598a5\Qwen3.5-9B-Q4_K_M.gguf'

uv run python run_service.py
