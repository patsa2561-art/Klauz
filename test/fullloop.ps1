# meaningdiff — FULL LOOP end-to-end system test (Windows).
#   powershell -ExecutionPolicy Bypass -File test/fullloop.ps1
# Exercises every layer: deterministic mode (no AI) → smart mode (local LLM) →
# web server → eval suites. Prints a consolidated PASS/FAIL tally. Exit code = #fails.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
$esc = [char]27
function clean($s) { ($s -replace "$esc\[[0-9;]*m", "") }
function run($argz) { clean ((& node @argz 2>&1) -join "`n") }
$tmp = $env:TEMP
$script:pass = 0; $script:fail = 0
$log = New-Object System.Collections.ArrayList
function chk($name, $cond, $detail = '') {
  if ($cond) { $script:pass++; [void]$log.Add("  [PASS] $name") }
  else { $script:fail++; [void]$log.Add("  [FAIL] $name  $detail") }
}
function killMneme { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*mneme*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }; Start-Sleep -Milliseconds 400 }

Write-Output "===== meaningdiff FULL LOOP ====="

Write-Output "`n--- PHASE 1: deterministic mode (no AI) ---"
$env:MEANINGDIFF_OLLAMA = 'http://127.0.0.1:1'   # force "no LLM"
chk 'doctor reports DETERMINISTIC' ((run @('bin/meaningdiff.js', 'doctor')) -match 'DETERMINISTIC')
run @('bin/meaningdiff.js', 'certify', 'examples/contract.before.txt', 'examples/contract.after.txt', '-o', "$tmp\fl.pcr", '-q') | Out-Null
chk 'certify (no AI) produced a cert' (Test-Path "$tmp\fl.pcr")
chk 'verify genuine = VALID' ((run @('bin/meaningdiff.js', 'verify', "$tmp\fl.pcr", 'examples/contract.before.txt', 'examples/contract.after.txt')) -match 'VALID')
chk 'verify tampered = TAMPERED' ((run @('bin/meaningdiff.js', 'verify', "$tmp\fl.pcr", 'examples/contract.before.txt', 'examples/clause.v1.txt')) -match 'TAMPERED')
chk 'lint runs' ((run @('bin/meaningdiff.js', 'lint', 'examples/contract.before.txt')) -match 'Linter')
chk 'merge3 detects conflict' ((run @('bin/meaningdiff.js', 'merge3', 'examples/clause.v1.txt', 'examples/clause.v2.txt', 'examples/clause.v3.txt')) -match 'CONFLICT|merge')
chk 'scan runs' ((run @('bin/meaningdiff.js', 'scan', 'examples/contract.after.txt')) -match 'risk scan')
chk 'reverse runs' ((run @('bin/meaningdiff.js', 'reverse', 'examples/contract.after.txt', '--parties', 'Provider,Client')) -match 'Reversibility')
chk 'selective proof-tier 100% / 0-err' ((run @('test/eval-selective.mjs')) -match 'accuracy on proven : 100.0%')
Remove-Item Env:\MEANINGDIFF_OLLAMA

Write-Output "`n--- PHASE 2: smart mode (local LLM) ---"
killMneme
chk 'doctor auto-detects SMART' ((run @('bin/meaningdiff.js', 'doctor')) -match 'SMART')
$cmp = run @('bin/meaningdiff.js', 'examples/contract.before.txt', 'examples/contract.after.txt', '--parties', 'Provider,Client')
chk 'compare returns a verdict' ($cmp -match 'verdict')
chk 'compare shows power-shift' ($cmp -match 'power-shift')
killMneme
chk 'certify (smart) tags a tier' ((run @('bin/meaningdiff.js', 'certify', 'examples/contract.before.txt', 'examples/contract.after.txt', '-o', "$tmp\fl2.pcr", '--parties', 'Provider,Client')) -match 'PROVEN|CONSENSUS|ABSTAIN')

Write-Output "`n--- PHASE 3: web server ---"
killMneme
$proc = Start-Process node -ArgumentList 'bin/meaningdiff.js', 'serve', '7766' -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
try {
  chk '/capabilities llm=true' ((Invoke-WebRequest http://127.0.0.1:7766/capabilities -UseBasicParsing -TimeoutSec 15).Content -match '"llm":true')
  chk '/health ok' ((Invoke-WebRequest http://127.0.0.1:7766/health -UseBasicParsing -TimeoutSec 10).Content -match '"ok":true')
  $db = @{ old = 'Pay within 30 days.'; new = 'Pay within 60 days.'; parties = 'Provider,Client' } | ConvertTo-Json
  chk '/diff returns verdict' ((Invoke-WebRequest http://127.0.0.1:7766/diff -Method Post -Body $db -ContentType 'application/json' -UseBasicParsing -TimeoutSec 60).Content -match 'verdict')
  $cb = @{ old = 'The Provider shall use reasonable efforts.'; new = 'The Provider shall use best efforts.'; parties = 'Provider,Client' } | ConvertTo-Json
  chk '/certify returns rows+tier' ((Invoke-WebRequest http://127.0.0.1:7766/certify -Method Post -Body $cb -ContentType 'application/json' -UseBasicParsing -TimeoutSec 120).Content -match 'PROVEN|CONSENSUS|ABSTAIN|rows')
} catch { chk 'web server endpoints' $false $_.Exception.Message }
finally { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue }

Write-Output "`n--- PHASE 4: eval suites ---"
killMneme
chk 'regression 80 passed / 0 failed' ((run @('test/all.test.mjs')) -match 'TOTAL: 80 passed, 0 failed')
killMneme
chk 'tribunal: 0 silent-errors' ((run @('test/eval-tribunal.mjs')) -match 'silent-errors 0')
killMneme
chk 'favor power-shift >= 90%' ((run @('test/evaluate-favor.js')) -match '\((9[0-9]|100)\.\d%\)')

Write-Output ""
Write-Output ($log -join "`n")
Write-Output ""
Write-Output ("===== FULL LOOP: {0} passed, {1} failed =====" -f $script:pass, $script:fail)
exit $script:fail
