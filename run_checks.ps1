$ErrorActionPreference = 'Stop'

$root = 'e:\Meetin advisor'
Set-Location $root

Write-Host '=== 1) LLM probe ==='
node tools/probe_llm.mjs
$probe = $LASTEXITCODE

Write-Host '=== 2) type check ==='
npx tsc --noEmit
$tsc = $LASTEXITCODE

Write-Host '=== 3) smoke-watch (build only) ==='
npm run build
$build = $LASTEXITCODE

if (Test-Path 'dist/index.html') {
    Write-Host '[build] dist/index.html present'
} else {
    Write-Host '[build] dist/index.html MISSING' -ForegroundColor Red
    $build = 1
}

Clear-Host
Write-Host 'SUMMARY' -ForegroundColor Cyan
Write-Host "LLM probe exit : $probe (0=ok)"
Write-Host "tsc     exit    : $tsc (0=clean)"
Write-Host "build   exit    : $build (0=ok)"

if ($probe -ne 0 -or $tsc -ne 0 -or $build -ne 0) {
    exit 1
}
