# On-screen part of evaluation clip 5 (evidence-analysis task 15). Windows PowerShell 5.1.
# Runs the SLEUTH API flow one step at a time against a local `pnpm dev` in fixture mode.
# Press Enter to go to the next step while you speak. -NoPause runs straight through (for checks).
param(
  [string]$BaseUrl = "http://127.0.0.1:3000/api/v1",
  [switch]$NoPause
)
$ErrorActionPreference = "Stop"
$headers = @{ "x-fixture-user" = "clip-5-presenter" }

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

Step "1. Create a project"
$project = (Call POST "/projects" @{ name = "Clip Five" }).project
Write-Host "project id: $($project.id)"

Step "2. Save a script"
$script = Call POST "/projects/$($project.id)/scripts" @{ text = "Open the invoice list.`nPress export." }
Write-Host "script version: $($script.scriptVersion.version), lines: $($script.scriptVersion.segments.Count)"

Step "3. Set a checklist"
$items = (Call POST "/projects/$($project.id)/checklist" @{ items = @(@{ label = "Invoice list" }, @{ label = "Export" }) }).items
Write-Host "checklist items: $($items.Count)"

Step "4. Ask for an upload link"
$up = Call POST "/projects/$($project.id)/assets/upload-url" @{ fileName = "demo.mp4"; mimeType = "video/mp4"; durationMs = 90000 }
Write-Host "video version: $($up.assetVersion.version), link expires: $($up.expiresAt)"

Step "5. Start the analysis"
$job = (Call POST "/projects/$($project.id)/analysis" @{}).job
Write-Host "job: $($job.id)"

Step "6. Check the job status"
$status = (Call GET "/projects/$($project.id)/jobs/$($job.id)" $null).job.status
Write-Host "job status: $status"
