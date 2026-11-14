# Final production check (Thu 3 Dec). Windows PowerShell 5.1, from a clean worktree of origin/main.
#
#   powershell -ExecutionPolicy Bypass -File scripts/final-prod-check.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/final-prod-check.ps1 -SmokeOnly
#
# In order:
#   1. scripts/prod-smoke.ts (parts A and B) against the live site.
#   2. scripts/prod-e2e.ts in team-account mode with our own evidence clip
#      (scripts/make-evidence-clip.ps1 builds it if it is missing). Skipped with -SmokeOnly.
#   3. A list of the test projects to delete, the SQL for the Supabase SQL Editor, and the
#      Storage folders to delete in the dashboard.
#
# The production Project URL and publishable key are public values (they are in the page). Pass
# them as parameters or type them at the prompt. They are never read from .env.local, so this can
# never reach the dev project by mistake. The team e-mail and password are asked with Read-Host
# (the password with -AsSecureString). Nothing typed is echoed, logged or written to a file. Every
# environment variable this script sets is removed in the finally block.
param(
  [string]$SiteUrl = "https://sleuth-eight.vercel.app",
  [string]$ProjectUrl = "",
  [string]$PublishableKey = "",
  [string]$Clip = (Join-Path $env:TEMP "sleuth-evidence-clip.mp4"),
  [switch]$SmokeOnly
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$set = New-Object System.Collections.Generic.List[string]
$projectIds = New-Object System.Collections.Generic.List[string]
$results = [ordered]@{}

function Set-ShellVar([string]$name, [string]$value) {
  Set-Item -Path "Env:$name" -Value $value
  if (-not $set.Contains($name)) { $set.Add($name) }
}

# Runs one script and streams its output. Collects the test project ids it prints.
function Invoke-Step([string]$label, [string[]]$arguments, [scriptblock]$onLine) {
  Write-Host ""
  Write-Host "== $label" -ForegroundColor Cyan
  $last = ""
  # Windows PowerShell turns a native command's stderr into errors; keep going and show them.
  $ErrorActionPreference = "Continue"
  & pnpm --silent tsx @arguments 2>&1 | ForEach-Object {
    $line = "$_"
    Write-Host $line
    if ($line -match "test project id:\s+(\S+)") { $projectIds.Add($Matches[1]) }
    if ($null -ne $onLine) { & $onLine $line }
    if ($line.Trim() -ne "") { $last = $line.Trim() }
  }
  $results[$label] = $last
}

if ($SiteUrl -notmatch '^https://[A-Za-z0-9.-]+$') { throw "SiteUrl must be an https origin with no path." }

try {
  if ($ProjectUrl -eq "") { $ProjectUrl = Read-Host "Production Project URL (https://<ref>.supabase.co)" }
  $ProjectUrl = $ProjectUrl.Trim().TrimEnd("/")
  if ($ProjectUrl -notmatch '^https://[a-z0-9-]+\.supabase\.co$') {
    throw "The Project URL must look like https://<ref>.supabase.co (value not shown)."
  }
  if ($PublishableKey -eq "") { $PublishableKey = Read-Host "Production publishable (anon) key" }
  $PublishableKey = $PublishableKey.Trim()
  if ($PublishableKey -eq "") { throw "The publishable key is empty." }

  Set-ShellVar "PROD_SITE_URL" $SiteUrl
  Set-ShellVar "PROD_SUPABASE_URL" $ProjectUrl
  Set-ShellVar "PROD_SUPABASE_ANON_KEY" $PublishableKey
  Push-Location $repo
  try {
    Invoke-Step "Smoke test (parts A and B)" @("scripts/prod-smoke.ts") $null

    if (-not $SmokeOnly) {
      if (-not (Test-Path -LiteralPath $Clip)) {
        Write-Host "Building our own evidence clip..."
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\make-evidence-clip.ps1") -Out $Clip
      }
      $email = Read-Host "Team account e-mail"
      $secure = Read-Host "Team account password" -AsSecureString
      $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
      try {
        Set-ShellVar "PROD_E2E_EMAIL" $email
        Set-ShellVar "PROD_E2E_PASSWORD" ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr))
      } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        $email = $null
      }
      $onLine = {
        param($line)
        if ($line -match "worker dispatch:\s+(.+)$") {
          $word = $Matches[1].Trim()
          $results["Worker dispatch"] = $word
          if ($word -ne "sent") {
            Write-Host ""
            Write-Host "The server did not start the worker ($word)." -ForegroundColor Yellow
            Write-Host "1. Supabase, sleuth-prod, SQL Editor: run the read-only queue check from the top of scripts/prod-e2e.ts."
            Write-Host "2. Only if it shows exactly one row, named zz-test-e2e-..., with queued 1 and running 0, run in a second window:"
            Write-Host "   gh workflow run worker.yml --repo dngvmnh/sleuth"
            Write-Host "3. Do not start it for any other row. This window keeps waiting for the job."
            Write-Host ""
          }
        }
      }
      Invoke-Step "Team-account e2e" @("scripts/prod-e2e.ts", $Clip) $onLine
    }
  } finally {
    Pop-Location
  }
} finally {
  foreach ($name in $set) { Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue }
  $PublishableKey = $null
  Write-Host ""
  Write-Host "Cleared $($set.Count) environment variable(s) set by this script."
}

Write-Host ""
Write-Host "== Summary" -ForegroundColor Cyan
foreach ($k in $results.Keys) { Write-Host ("{0}: {1}" -f $k, $results[$k]) }

Write-Host ""
Write-Host "== Delete the test data" -ForegroundColor Cyan
if ($projectIds.Count -eq 0) {
  Write-Host "No test project ids were printed."
} else {
  Write-Host "Test project ids:"
  foreach ($id in $projectIds) { Write-Host "  $id" }
  $list = ($projectIds | ForEach-Object { "'$_'" }) -join ", "
  Write-Host ""
  Write-Host "Supabase, sleuth-prod, SQL Editor (docs/coordination/cleanup.md, section 1a). Run the select first:"
  Write-Host "  select id, name, owner_id, created_at from projects where id in ($list) and not is_demo;"
  Write-Host "  delete from projects where id in ($list) and not is_demo;"
  Write-Host ""
  Write-Host "Then Storage, Buckets, video-assets: delete these folders (SQL cannot delete Storage objects):"
  foreach ($id in $projectIds) { Write-Host "  $id" }
}
