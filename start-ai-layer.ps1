# Starts the Python ai-layer service on http://127.0.0.1:8077.
# Run this in its OWN terminal, alongside `cd apps/api; npm run dev` in another.
# It reads OPENROUTER_API_KEY / META_ACCESS_TOKEN / AI_LAYER_API_KEY from the root .env.
#
#   PS> .\start-ai-layer.ps1
#
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$py = Join-Path $root "cos\Scripts\python.exe"
if (-not (Test-Path $py)) {
  Write-Error "venv python not found at $py - create/activate the 'cos' venv first."
  exit 1
}
$env:PYTHONIOENCODING = "utf-8"
Set-Location (Join-Path $root "apps\ai-layer")
Write-Host "Starting ai-layer on http://127.0.0.1:8077  (Ctrl+C to stop)" -ForegroundColor Green
& $py -m uvicorn ai_layer.api:app --host 127.0.0.1 --port 8077
