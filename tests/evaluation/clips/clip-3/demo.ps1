# On-screen part of evaluation clip 3 (evidence-analysis task 11). Windows PowerShell 5.1.
# Runs the SLEUTH API flow one step at a time against a local `pnpm dev` in fixture mode.
# Press Enter to go to the next step while you speak. -NoPause runs straight through (for checks).
param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api/v1",
  [switch]$NoPause
)
$ErrorActionPreference = "Stop"
$headers = @{ "x-fixture-user" = "clip-3-presenter" }

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

Step "1. Make a copy of the demo"
$project = (Call POST "/projects" @{ name = "Clip Three"; copyFromDemo = $true }).project
Write-Host "project id: $($project.id)"

Step "2. List the evidence"
$evidence = (Call GET "/projects/$($project.id)/evidence" $null).evidence
Write-Host "evidence candidates: $($evidence.Count)"

Step "3. Confirm one candidate"
$first = $evidence | Where-Object { $_.status -eq "candidate" } | Select-Object -First 1
if ($null -eq $first) { throw "The copy has no undecided candidate." }
$review = Call PATCH "/evidence/$($first.id)/review" @{ decision = "confirm"; note = "Checked by the presenter." }
Write-Host "evidence $($first.id) is now: $($review.evidence.status)"

Step "4. Show the coverage"
$coverage = Call GET "/projects/$($project.id)/coverage" $null
Write-Host "checklist items: $($coverage.coverage.items.Count), seal blockers: $($coverage.blockers.Count)"

Step "5. Try the Final Seal"
try {
  $seal = Call POST "/projects/$($project.id)/seal" @{ note = "Clip three." }
  Write-Host "sealed: $($seal.seal.id)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "the seal was refused (HTTP $code): the report lists what blocks it"
}

Step "6. Open the printable report"
$html = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/projects/$($project.id)/report.html" -Headers $headers
Write-Host "report.html: HTTP $($html.StatusCode), $($html.Content.Length) characters"
