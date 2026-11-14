# Makes an evidence test clip of our own for scripts/prod-e2e.ts (WP3): three slides made with
# ffmpeg, each with on-screen text, and Windows text-to-speech reading the same line aloud. The
# script and checklist it matches are in scripts/evidence-clip.json (the ones prod-e2e.ts uses). No
# third-party media. Needs ffmpeg and ffprobe on the PATH.
# Usage: powershell -File scripts\make-evidence-clip.ps1 [-Out <path>]
param([string]$Out = (Join-Path $env:TEMP "sleuth-evidence-clip.mp4"))
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$spec = Get-Content (Join-Path $PSScriptRoot "evidence-clip.json") -Raw | ConvertFrom-Json
$work = Join-Path $env:TEMP "sleuth-evidence-clip"
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path $work | Out-Null
Push-Location $work
try {
  # A relative font file name avoids drive-letter escaping in the filter string.
  Copy-Item "C:\Windows\Fonts\arial.ttf" "font.ttf" -Force
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $parts = @()
  for ($i = 0; $i -lt $spec.slides.Count; $i++) {
    $slide = $spec.slides[$i]
    $wav = "s$i.wav"
    $synth.SetOutputToWaveFile((Join-Path $work $wav))
    $synth.Speak($slide.speech)
    $synth.SetOutputToNull()
    $seconds = [double](& ffprobe -v error -show_entries format=duration -of csv=p=0 $wav) + 1.0
    $filters = @()
    $y = 220
    $k = 0
    foreach ($text in $slide.onScreen) {
      $txt = "s${i}_$k.txt"
      [IO.File]::WriteAllText((Join-Path $work $txt), $text)
      $filters += "drawtext=fontfile=font.ttf:textfile=${txt}:fontsize=72:fontcolor=white:x=80:y=${y}"
      $y += 120
      $k++
    }
    $mp4 = "s$i.mp4"
    & ffmpeg -nostdin -y -v error -f lavfi -i "color=c=0x203040:s=1280x720:d=${seconds}:r=10" -i $wav `
      -vf ($filters -join ",") -af apad -t $seconds -c:v libx264 -pix_fmt yuv420p -c:a aac -ar 44100 -ac 1 $mp4
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed on slide $i" }
    $parts += "file '$mp4'"
  }
  $synth.Dispose()
  Set-Content -Path "list.txt" -Value $parts -Encoding ascii
  & ffmpeg -nostdin -y -v error -f concat -safe 0 -i list.txt -c copy $Out
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg concat failed" }
} finally {
  Pop-Location
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
$len = [double](& ffprobe -v error -show_entries format=duration -of csv=p=0 $Out)
Write-Output ("clip ready: {0:N1} s" -f $len)
