$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:4173/'
Push-Location $root
try {
  npm install
  if ($LASTEXITCODE) { throw 'npm install failed' }
  npm run build
  if ($LASTEXITCODE) { throw 'build failed' }
} finally {
  Pop-Location
}

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) '')
)
foreach ($dir in $targets) {
  $lnk = $shell.CreateShortcut((Join-Path $dir 'Estudio.lnk'))
  $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\scripts\launch.ps1`""
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$root\public\icon.ico"
  $lnk.WindowStyle = 7
  $lnk.Description = 'Estudio PDF reader'
  $lnk.Save()
}

function Test-Server {
  try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }
}

if (-not (Test-Server)) {
  Start-Process -FilePath 'node' -ArgumentList "`"$root\scripts\serve.mjs`"" -WindowStyle Hidden
  for ($i = 0; $i -lt 50 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 100 }
}

$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) { Start-Process -FilePath $browser -ArgumentList $url } else { Start-Process $url }

Write-Host ''
Write-Host 'Estudio is built and open in your browser.'
Write-Host 'To install it as an app, click "Install Estudio" at the top of the library (or the install icon in the address bar).'
Write-Host 'Once installed, PDFs can be opened with Estudio from Explorer (right-click > Open with), and the app works without the local server.'
Write-Host 'Run this script again after pulling changes; the installed app picks up the new version the next time it shows the library.'
