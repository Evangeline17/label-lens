$ErrorActionPreference = 'Stop'

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = 'C:\Users\asus\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$playwrightPath = 'C:\Users\asus\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$scriptPath = Join-Path $sourceDir 'export_cards.mjs'

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Bundled Node.js not found at: $nodePath"
}
if (-not (Test-Path -LiteralPath $playwrightPath)) {
  throw "Bundled Playwright not found at: $playwrightPath"
}

$env:LABELLENS_PLAYWRIGHT_PATH = $playwrightPath
& $nodePath $scriptPath
if ($LASTEXITCODE -ne 0) {
  throw 'Card export failed.'
}
