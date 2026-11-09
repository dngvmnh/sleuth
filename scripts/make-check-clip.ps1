# Makes a 10-second test clip of our own for scripts/provider-check.ts: synthetic speech (Windows
# speech engine) over a plain screen with two lines of text. No third-party media.
# Usage: powershell -File scripts\make-check-clip.ps1 [-Out <path>]
param([string]$Out = (Join-Path $env:TEMP "sleuth-check-clip.mp4"))
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$wav = Join-Path $env:TEMP "sleuth-check-speech.wav"
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile($wav)
$synth.Speak("Open the project and click Export report. The report downloads as a CSV file.")
$synth.Dispose()
# A relative font file name avoids drive-letter escaping in the filter string.
Push-Location $env:TEMP
Copy-Item "C:\Windows\Fonts\arial.ttf" "sleuth-check-font.ttf" -Force
$font = "sleuth-check-font.ttf"
$vf = "drawtext=fontfile=${font}:text='Sleuth demo':fontsize=64:fontcolor=white:x=60:y=120," +
      "drawtext=fontfile=${font}:text='Export report':fontsize=48:fontcolor=yellow:x=60:y=260"
ffmpeg -nostdin -y -v error -f lavfi -i "color=c=0x203040:s=1280x720:d=10:r=10" -i $wav `
  -vf $vf -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest $Out
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "ffmpeg failed" }
Remove-Item (Join-Path $env:TEMP "sleuth-check-font.ttf") -Force
Remove-Item $wav -Force
Write-Output "clip ready"

