# Build the zero-install Windows bundle: users unzip and double-click — no Node
# install required. Produces meaningdiff-portable-win-x64.zip (node.exe +
# node_modules + app). Run from the repo root:  powershell -File build-portable.ps1
$ErrorActionPreference = 'Stop'
$NODE_VER = 'v22.22.1'                 # match the dev Node so native sharp ABI lines up
$repo  = $PSScriptRoot
$stage = Join-Path $env:TEMP 'md-portable-build'
$zip   = Join-Path $repo 'meaningdiff-portable-win-x64.zip'

# 1) fetch portable node.exe into ./node (cached)
$nodeDir = Join-Path $repo 'node'
New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
if (-not (Test-Path "$nodeDir\node.exe")) {
  Write-Host "downloading node $NODE_VER ..."
  Invoke-WebRequest "https://nodejs.org/dist/$NODE_VER/win-x64/node.exe" -OutFile "$nodeDir\node.exe" -UseBasicParsing
}

# 2) sanity: deps installed?
if (-not (Test-Path "$repo\node_modules\sharp")) { throw "node_modules missing — run: npm install" }

# 3) stage exactly what ships (no .git, no key, no tests, no examples)
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($d in 'node_modules','node','src','bin','public') {
  robocopy "$repo\$d" "$stage\$d" /E /NFL /NDL /NJH /NJS /NC /NS | Out-Null
}
Copy-Item "$repo\package.json","$repo\meaningdiff.bat","$repo\meaningdiff.command","$repo\README.md" $stage
Remove-Item "$stage\.meaningdiff" -Recurse -Force -ErrorAction SilentlyContinue  # never ship a signing key

# 4) zip
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $zip) { Remove-Item $zip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
Remove-Item $stage -Recurse -Force

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 0)
Write-Host "✓ built $zip  ($mb MB) — unzip anywhere and double-click meaningdiff.bat"
