# MEETX verification (Windows convenience wrapper).
#
# The cross-platform source of truth is `npm test` / `tools/run-all-checks.mjs`;
# this script adds the live network probe and prints a single PASS/FAIL summary.

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

$results = [ordered]@{}

Write-Host '=== 1) type check ===' -ForegroundColor Cyan
npm run typecheck
$results['typecheck'] = $LASTEXITCODE

Write-Host '=== 2) offline suite (guard + harnesses) ===' -ForegroundColor Cyan
npm test
$results['npm test'] = $LASTEXITCODE

Write-Host '=== 3) production build ===' -ForegroundColor Cyan
npm run build
$results['npm run build'] = $LASTEXITCODE
if (Test-Path 'dist/index.html') {
    Write-Host '[build] dist/index.html present'
} else {
    Write-Host '[build] dist/index.html MISSING' -ForegroundColor Red
    $results['npm run build'] = 1
}

Write-Host '=== 4) live LLM probe (reads .env, needs network) ===' -ForegroundColor Cyan
node tools/probe_llm.mjs
$results['LLM probe'] = $LASTEXITCODE

Write-Host ''
Write-Host 'SUMMARY' -ForegroundColor Cyan
$failed = 0
foreach ($key in $results.Keys) {
    $ok = ($results[$key] -eq 0)
    if (-not $ok) { $failed += 1 }
    $label = if ($ok) { 'PASS' } else { 'FAIL' }
    Write-Host ("[{0}] {1} (exit {2})" -f $label, $key, $results[$key])
}

if ($failed -gt 0) {
    Write-Host "$failed check(s) failed" -ForegroundColor Red
    exit 1
}
Write-Host 'all checks passed' -ForegroundColor Green

