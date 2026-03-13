# Development build script for Windows.
# Node must be available (v22+ via fnm, nvm, or system).
$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition))
Set-Location $ProjectDir

Write-Host "Node $(node --version)" -ForegroundColor Cyan

# ── 1. Install tauri-cli if missing ──
$tauriCheck = cargo tauri --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing tauri-cli..." -ForegroundColor Cyan
    cargo install tauri-cli
}

# ── 2. Install dependencies ──
Write-Host "Installing dependencies..." -ForegroundColor Cyan
pnpm install

# ── 3. Rebuild native modules ──
Write-Host "Rebuilding native modules..." -ForegroundColor Cyan
Set-Location "$ProjectDir\server"
pnpm rebuild better-sqlite3 sqlite-vec

# ── 4. Bundle server ──
Write-Host "Bundling server..." -ForegroundColor Cyan
npx tsx build.ts

# ── 5. Build frontend ──
Write-Host "Building frontend..." -ForegroundColor Cyan
Set-Location "$ProjectDir\app"
pnpm run build

Set-Location $ProjectDir
Write-Host "Build complete." -ForegroundColor Green
