# Run once after recording clip 1. Windows PowerShell 5.1, needs ffprobe on PATH.
# Fills durationMs, video.sha256, recordedOn and video.storedAt in clip.json. Labels are the labeller's.
param(
  [Parameter(Mandatory = $true)][string]$StoredAt
)
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$video = Join-Path $dir "clip-1.mp4"
if (-not (Test-Path -LiteralPath $video)) { throw "clip-1.mp4 is not in $dir yet." }

$seconds = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $video
if ($LASTEXITCODE -ne 0) { throw "ffprobe could not read clip-1.mp4." }
$durationMs = [int][math]::Round([double]::Parse($seconds, [Globalization.CultureInfo]::InvariantCulture) * 1000)
if ($durationMs -lt 60000 -or $durationMs -gt 120000) {
  throw "The clip is $durationMs ms long. Record 60 to 120 seconds."
}
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $video).Hash.ToLowerInvariant()

$path = Join-Path $dir "clip.json"
$json = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) | ConvertFrom-Json
$json.durationMs = $durationMs
$json.recordedOn = (Get-Date).ToString("yyyy-MM-dd")
$json.video.sha256 = $hash
$json.video.storedAt = $StoredAt
# UTF-8 without a byte order mark, so the names stay readable.
[IO.File]::WriteAllText($path, ($json | ConvertTo-Json -Depth 5) + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host "clip.json updated: $durationMs ms, sha256 $($hash.Substring(0, 12))..."
