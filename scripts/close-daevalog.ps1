# Closes a running Daevalog as its tray's Quit does: the fight on the meter is
# saved and its tray icon goes with it. Killing it leaves the icon in the tray
# until the pointer passes over it, so that's only the fallback.
[CmdletBinding()]
param()
$names = 'aion2-meter-windows', 'aion2-meterd'
$app = Get-Process -Name 'aion2-meter-windows' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($app -and $app.Path) {
    Write-Output 'Closing the running Daevalog'
    Start-Process -FilePath $app.Path -ArgumentList '--quit' -Wait
    $deadline = (Get-Date).AddSeconds(8)
    while ((Get-Process -Name $names -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
    }
}
$left = Get-Process -Name $names -ErrorAction SilentlyContinue
if ($left) {
    Write-Warning 'Daevalog did not quit in time; closing it by force.'
    $left | Stop-Process -Force
    Start-Sleep -Seconds 1
}
