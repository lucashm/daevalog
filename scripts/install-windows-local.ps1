# Builds Daevalog from this checkout, uncommitted changes included, installs it for
# your user (over the installed one) and starts it.
#   .\scripts\install-windows-local.ps1            build, install, start
#   .\scripts\install-windows-local.ps1 -NoLaunch  build and install only
# Your fights and settings (%LOCALAPPDATA%\aion2-meter) are kept.
[CmdletBinding()]
param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

# What's being installed: the commit, and whether there are edits on top of it.
$commit = (& git -C $root rev-parse --short HEAD).Trim()
$dirty = [bool](& git -C $root status --porcelain --untracked-files=no)
$version = "local-$commit" + $(if ($dirty) { '-dirty' } else { '' })
Write-Output "Building $version"

& "$PSScriptRoot/package-windows.ps1" -Version $version
if (-not $?) { throw 'Build failed.' }
$setup = Join-Path $root "dist/aion2-meter-$version-x86_64-windows-setup.exe"
if (-not (Test-Path -LiteralPath $setup)) { throw "Installer not found: $setup" }

# The installer can't replace files the app has open. Capture saves fights every
# few seconds, so at most the last moments of a running fight are lost.
$running = Get-Process -Name 'aion2-meter-windows', 'aion2-meterd' -ErrorAction SilentlyContinue
if ($running) {
    Write-Output 'Closing the running Daevalog'
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
}

Write-Output 'Installing'
# The installer reuses the folder it last installed to; one under Temp (a test
# install) could be cleaned away, so that one goes to the default folder instead.
$arguments = @('/S')
$remembered = (Get-ItemProperty 'HKCU:\Software\lucashm\Daevalog' -ErrorAction SilentlyContinue).'(default)'
if ($remembered -and $remembered.StartsWith([IO.Path]::GetTempPath().TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
    $arguments += "/D=$(Join-Path $env:LOCALAPPDATA 'Daevalog')"
}
$install = Start-Process -FilePath $setup -ArgumentList $arguments -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer exited with $($install.ExitCode)." }

# Where the installer put it, from its uninstall entry.
$entry = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' |
    ForEach-Object { Get-ItemProperty $_.PSPath } |
    Where-Object { $_.DisplayName -eq 'Daevalog' } | Select-Object -First 1
if (-not $entry) { throw 'Installed, but its uninstall entry is missing.' }
$app = Join-Path $entry.InstallLocation.Trim('"') 'aion2-meter-windows.exe'
Write-Output "Installed $version at $app"

# Earlier local builds: about 64 MB each, in a folder OneDrive may sync.
Get-ChildItem -LiteralPath (Join-Path $root 'dist') -Filter 'aion2-meter-local-*' |
    Where-Object { $_.Name -notlike "aion2-meter-$version-*" } |
    Remove-Item -Recurse -Force

if (-not (Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32\wpcap.dll'))) {
    Write-Warning 'Npcap is not installed: live capture needs it (https://npcap.com/#download, WinPcap API-compatible Mode).'
}
if (-not $NoLaunch) { Start-Process -FilePath $app }
