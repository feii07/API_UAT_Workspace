param([string]$TargetDir = "portable")
$ErrorActionPreference = "Stop"
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw "Rust/Cargo is required on the build machine." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is required only at build time." }
npm install
npm run tauri build
$exe = Join-Path $PWD "src-tauri\target\release\api-uat-workspace.exe"
if (-not (Test-Path $exe)) { throw "Tauri build did not produce the expected EXE: $exe" }
New-Item -ItemType Directory -Force $TargetDir | Out-Null
Copy-Item $exe (Join-Path $TargetDir "API-UAT-Workspace.exe") -Force
Copy-Item README.txt (Join-Path $TargetDir "README.txt") -Force
New-Item -ItemType Directory -Force (Join-Path $TargetDir "data") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $TargetDir "exports") | Out-Null
Compress-Archive -Path "$TargetDir\*" -DestinationPath "API-UAT-Workspace-Portable.zip" -Force
Write-Host "Created API-UAT-Workspace-Portable.zip"
