$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 4173
$url = "http://127.0.0.1:$port/"

Push-Location $root
try {
  npm install
  if ($LASTEXITCODE) { throw 'npm install failed' }
  npm run build
  if ($LASTEXITCODE) { throw 'build failed' }
} finally {
  Pop-Location
}

# Earlier versions of this script made launcher shortcuts named Estudio. Edge now makes its own
# Estudio shortcuts when the app is installed, so ours go; a shortcut is ours only if it runs launch.ps1.
$shell = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
foreach ($dir in $dirs) {
  foreach ($file in Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -File -ErrorAction SilentlyContinue) {
    if ($shell.CreateShortcut($file.FullName).Arguments -like '*scripts\launch.ps1*') {
      Remove-Item -LiteralPath $file.FullName
      Write-Host "Removed old launcher shortcut $($file.FullName)"
    }
  }
}

function Test-PortInUse {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-PortInUse)) {
  Start-Process -FilePath 'node' -ArgumentList "`"$root\scripts\serve.mjs`"" -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 50 -and -not (Test-PortInUse); $i++) { Start-Sleep -Milliseconds 100 }
}

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { Start-Process -FilePath $edge -ArgumentList $url } else { Start-Process "microsoft-edge:$url" }

Write-Host ''
Write-Host "Estudio is built and open in Edge at $url"
Write-Host 'First time: click "Install Estudio" at the top of the library (or the install icon in the address bar).'
Write-Host 'Afterwards: open Estudio from the Start menu, or open a PDF with it from Explorer. The installed app works without the local server.'
Write-Host 'Run this script again after pulling changes; the installed app switches to the new version the next time it shows the library.'
