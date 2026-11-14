# Clip 1: recording script (evidence-analysis 11)

For Đạt (@phatdat220707), who records (decision D-10, reassigned from Đăng in issue #58). Đạt also labels it afterwards by watching, before anyone runs SLEUTH on it (decision D-10, changed 14 Nov; the bias this adds is stated in `docs/evaluation-protocol.md`). One take, your own screen. Narrate in your own voice or with a text-to-speech voice; if it is synthetic, say so (name the voice) when you send the link, so the clip table can list it (#66). Never a cloned or imitated real voice. No third-party footage, nothing secret on screen or in the audio.

## What the clip must test

A plain run with nothing left out. You read the 8 script lines below while the screen shows each step. Every checklist item is shown on screen.

This clip is the baseline: a good tool should report little or nothing here.

## The file

| Item         | Value                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| Length       | 60 to 120 seconds                                                                        |
| Language     | English                                                                                  |
| Format       | MP4, H.264 video, AAC audio, 1280x720 or 1920x1080, 30 fps                               |
| File name    | `clip-1.mp4`                                                                             |
| Put it in    | `tests/evaluation/clips/clip-1/clip-1.mp4` (Git ignores `*.mp4`, so it is not committed) |
| Copy kept at | the team's shared drive; write the link when you run `finalise.ps1`                      |

Record with the Windows Snipping Tool (screen recording, microphone on) or OBS. If the file is not H.264 and AAC, convert it:

```powershell
ffmpeg -i raw.mp4 -vf scale=-2:720 -r 30 -c:v libx264 -crf 28 -c:a aac -b:a 96k -movflags +faststart tests/evaluation/clips/clip-1/clip-1.mp4
```

## Before you press record

```powershell
$env:SLEUTH_DATA_MODE = "fixture"
pnpm dev
```

In a second PowerShell window, open the repo root and make the font large. Close mail and chat. Nothing secret on screen.

## Take

Start recording. Run `powershell -ExecutionPolicy Bypass -File tests/evaluation/clips/clip-1/demo.ps1`. Press Enter at each step while you speak. Leave a short pause after each line.

| Step on screen             | Say this                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| (start)                    | 1. This is the SLEUTH API running on my laptop in fixture mode.  |
| 1. List the projects       | 2. First I list the projects a visitor can see.                  |
| (list shown)               | 3. The only project is the public ProofPay demo.                 |
| 2. Open the demo project   | 4. Next I open the demo and read its script and checklist.       |
| 3. List the evidence       | 5. Then I list the evidence the analysis found for each line.    |
| 4. List the findings       | 6. Now I list the findings that still need a person.             |
| 5. Show the coverage       | 7. The coverage summary shows which checklist items are covered. |
| 6. Download the CSV report | 8. Finally I download the report as a CSV file.                  |

Stop recording. Check the length is 60 to 120 seconds. If it is too short, record again with longer pauses; do not add lines.

## After the take

1. Run `powershell -ExecutionPolicy Bypass -File tests/evaluation/clips/clip-1/finalise.ps1 -StoredAt "<shared drive link>"`. It fills the length, date, hash and link in `clip.json`.
2. Do not run SLEUTH or `pnpm eval` on it yet. Wait at least an hour so you label what the clip shows, not what you remember planning.
3. Watch it from start to end and write `labels.json` (`docs/evaluation-protocol.md`, "Labelling a clip in 20 minutes"), then set `labelledBy` in `clip.json` to your name. Commit `labels.json` on its own before any evaluation run.
4. Run `pnpm test`. The recording and its labels land in the same PR.
