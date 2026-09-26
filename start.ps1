$env:CODEPILOT_MODEL_TIMEOUT_SECONDS = '900'
$env:CODEPILOT_LLAMA_SERVER_EXE = 'F:\llama\llama-b10331-bin-win-vulkan-x64\llama-server.exe'
$env:CODEPILOT_MODEL_PATH = 'F:\llama\llama_cache\models--unsloth--qwen3.5-9B-GGUF\snapshots\3885219b6810b007914f3a7950a8d1b469d598a5\Qwen3.5-9B-Q4_K_M.gguf'

$cloudflared = Join-Path $PSScriptRoot 'node_modules\cloudflared\bin\cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
    $installer = Join-Path $PSScriptRoot 'node_modules\.bin\cloudflared.cmd'
    if (-not (Test-Path $installer)) {
        throw 'cloudflared is missing. Run npm.cmd install once, then run this file again.'
    }
    & $installer bin install
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $cloudflared)) {
        throw 'cloudflared.exe could not be installed.'
    }
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw 'uv is missing from PATH.'
}

function Test-Service($port) {
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

$apiReady = Test-Service 8000
$modelReady = Test-Service 8080
if ($apiReady -ne $modelReady) {
    throw 'Only one local service is running. Stop it before starting both services.'
}
if (-not $apiReady) {
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-Command', 'uv run python run_service.py' -WorkingDirectory $PSScriptRoot -WindowStyle Normal
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        if ((Test-Service 8000) -and (Test-Service 8080)) { break }
        Start-Sleep -Seconds 1
    }
    if (-not ((Test-Service 8000) -and (Test-Service 8080))) {
        throw 'The local service did not become ready. Check the PowerShell service window.'
    }
}

Write-Host 'Local frontend and API are ready at http://127.0.0.1:8000/'
if ($env:TUNNEL_TOKEN) {
    & $cloudflared tunnel run
} else {
    & $cloudflared tunnel --url http://127.0.0.1:8000
}
if ($LASTEXITCODE -ne 0) {
    throw "cloudflared exited with code $LASTEXITCODE."
}
