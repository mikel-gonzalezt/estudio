$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
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
Write-Host 'Estudio installed. Use the Estudio shortcut on the Desktop or in the Start menu.'
