# Nyx v2.0 - Quick Start Script
# Run this from the project root: .\start.ps1

Write-Host ""
Write-Host "  NYX v2.0 - Starting..." -ForegroundColor Magenta
Write-Host ""

# Check Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "  ERROR: Python not found. Install from python.org" -ForegroundColor Red
    exit 1
}

# Check Node
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "  ERROR: Node.js not found. Install from nodejs.org" -ForegroundColor Red
    exit 1
}

# Install backend deps if needed
Write-Host "  Checking backend dependencies..." -ForegroundColor Cyan
python -m pip install -q -r backend\requirements.txt
python -m pip install -q google-genai

# Install dashboard deps if needed
if (-not (Test-Path "dashboard\node_modules")) {
    Write-Host "  Installing dashboard dependencies..." -ForegroundColor Cyan
    Push-Location dashboard
    npm install --silent
    Pop-Location
}

# Build dashboard for production serving via backend
Write-Host "  Building dashboard..." -ForegroundColor Cyan
Push-Location dashboard
npm run build -- --silent 2>$null
Pop-Location

# Start backend
Write-Host "  Starting backend on http://127.0.0.1:8000..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD\backend
    python -m uvicorn main:app --host 127.0.0.1 --port 8000 --log-level warning
}

# Wait for backend to be ready
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep 1
    try {
        $r = Invoke-WebRequest "http://127.0.0.1:8000/health" -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}

if (-not $ready) {
    Write-Host "  ERROR: Backend did not start in time." -ForegroundColor Red
    Stop-Job $backendJob
    exit 1
}

Write-Host "  Backend ready." -ForegroundColor Green
Write-Host "  Opening dashboard at http://127.0.0.1:8000/" -ForegroundColor Green
Start-Process "http://127.0.0.1:8000/"

Write-Host ""
Write-Host "  Nyx is running. Press Ctrl+C to stop." -ForegroundColor Magenta
Write-Host ""

# Keep alive
try {
    while ($true) {
        Start-Sleep 2
        $state = Get-Job -Id $backendJob.Id
        if ($state.State -ne "Running") {
            Write-Host "  Backend stopped unexpectedly." -ForegroundColor Red
            break
        }
    }
} finally {
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    Write-Host "  Nyx stopped." -ForegroundColor Gray
}
