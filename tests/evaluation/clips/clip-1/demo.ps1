# On-screen part of evaluation clip 1 (evidence-analysis task 11). Windows PowerShell 5.1.
# Runs the SLEUTH API flow one step at a time against a local `pnpm dev` in fixture mode.
# Press Enter to go to the next step while you speak. -NoPause runs straight through (for checks).
param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api/v1",
  [switch]$NoPause
)
$ErrorActionPreference = "Stop"
$headers = @{ "x-fixture-user" = "clip-1-presenter" }

function Step([string]$title) {
  Write-Host ""
  Write-Host "== $title" -ForegroundColor Cyan
  if (-not $NoPause) { [void](Read-Host "Press Enter") }
}
function Call([string]$method, [string]$path, $body) {
  $req = @{ Method = $method; Uri = "$BaseUrl$path"; Headers = $headers }
  if ($null -ne $body) {
    $req.ContentType = "application/json"
    $req.Body = ($body | ConvertTo-Json -Depth 5)
  }
  return Invoke-RestMethod @req
}

Step "1. List the projects"
$projects = (Call GET "/projects" $null).projects
Write-Host "projects: $($projects.Count), first: $($projects[0].name)"

Step "2. Open the demo project"
$demo = Call GET "/projects/proofpay-demo" $null
Write-Host "script lines: $($demo.scriptVersion.segments.Count), checklist items: $($demo.checklist.Count)"

Step "3. List the evidence"
$evidence = (Call GET "/projects/proofpay-demo/evidence" $null).evidence
Write-Host "evidence candidates: $($evidence.Count)"

Step "4. List the findings"
$findings = (Call GET "/projects/proofpay-demo/findings" $null).findings
Write-Host "findings: $($findings.Count)"
$findings | Group-Object type | ForEach-Object { Write-Host "  $($_.Name): $($_.Count)" }

Step "5. Show the coverage"
$coverage = (Call GET "/projects/proofpay-demo/coverage" $null).coverage
Write-Host "checklist items in the coverage summary: $($coverage.items.Count)"

Step "6. Download the CSV report"
$csv = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/projects/proofpay-demo/report.csv" -Headers $headers
$rows = ($csv.Content -split "`n" | Where-Object { $_.Trim() -ne "" }).Count
Write-Host "report.csv rows, header included: $rows"
