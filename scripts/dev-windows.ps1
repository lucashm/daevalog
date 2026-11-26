# Runs Daevalog straight from this checkout for development:
#   - UI edits (windows/ui) show up instantly (Vite hot reload)
#   - Windows app edits (windows/src) rebuild and restart the app
#   - daemon edits (daemon/src) need this script started again
# Ctrl+C stops it. Uses your real data (%LOCALAPPDATA%\aion2-meter) and Npcap.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    # Npcap import library and libpcap version, for the daemon build.
    . "$PSScriptRoot/prepare-windows.ps1" | Out-Null
    if (-not (Test-Path 'windows/ui/node_modules')) {
        npm --prefix windows/ui ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    }

    # The app starts the daemon from its own folder, and the daemon looks for the
    # game data in a data folder next to itself.
    cargo build -p aion2-meterd
    if ($LASTEXITCODE -ne 0) { throw 'Daemon build failed.' }
    $target = (cargo metadata --format-version 1 --no-deps | ConvertFrom-Json).target_directory
    $data = Join-Path $target 'debug/data'
    $src = 'third_party/a2tools/src/data'
    New-Item -ItemType Directory -Force -Path "$data/i18n" | Out-Null
    Copy-Item -LiteralPath "$src/i18n/skills", "$src/i18n/npcs" -Destination "$data/i18n" -Recurse -Force
    Copy-Item -LiteralPath "$src/dot_skill_ids.json", "$src/skill_icons.json", "$src/abnormals.json", "$src/servers.json" -Destination $data -Force

    # Tauri runs Vite for the UI and rebuilds the app when windows/src changes.
    $devConfig = Join-Path $target 'tauri-dev.conf.json'
    [IO.File]::WriteAllText($devConfig, '{"build":{"devUrl":"http://127.0.0.1:5173","beforeDevCommand":{"script":"npm run dev","cwd":"ui"}}}')
    $running = Get-Process -Name 'aion2-meter-windows', 'aion2-meterd' -ErrorAction SilentlyContinue
    if ($running) {
        Write-Warning 'Closing the installed Daevalog: only one meter can capture at a time.'
        $running | Stop-Process -Force
    }
    Push-Location 'windows'
    try {
        & ./ui/node_modules/.bin/tauri.cmd dev --config $devConfig
    } finally { Pop-Location }
} finally { Pop-Location }
