# Clip 2: recording script (evidence-analysis 11)

> **Not needed for submission (decision D-21, 14 Nov).** The clip was recorded on 14 Nov; nobody labels it and no evaluation runs before submission. Keep this kit for a later run.

For Đạt (@phatdat220707), who records (decision D-10, reassigned from Đăng in issue #58). Đạt also labels it afterwards by watching, before anyone runs SLEUTH on it (decision D-10, changed 14 Nov; the bias this adds is stated in `docs/evaluation-protocol.md`). One take, your own screen. Narrate in your own voice or with a text-to-speech voice; if it is synthetic, say so (name the voice) when you send the link, so the clip table can list it (#66). Never a cloned or imitated real voice. No third-party footage, nothing secret on screen or in the audio.

## What the clip must test

One step is left out on purpose. You **say** line 5 (the upload link), but the screen never shows it: `demo.ps1` has no upload step, and the screen stays on the output of step 3 while you say it.

The checklist still lists "Get an upload link", so the analysis should report that item as not shown (a Ghost). The copy of the demo already has a video, so the analysis still starts.

## The file

| Item         | Value                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| Length       | 60 to 120 seconds                                                                        |
| Language     | English                                                                                  |
| Format       | MP4, H.264 video, AAC audio, 1280x720 or 1920x1080, 30 fps                               |
| File name    | `clip-2.mp4`                                                                             |
| Put it in    | `tests/evaluation/clips/clip-2/clip-2.mp4` (Git ignores `*.mp4`, so it is not committed) |
| Copy kept at | the team's shared drive; write the link when you run `finalise.ps1`                      |

Record with the Windows Snipping Tool (screen recording, microphone on) or OBS. If the file is not H.264 and AAC, convert it:

```powershell
ffmpeg -i raw.mp4 -vf scale=-2:720 -r 30 -c:v libx264 -crf 28 -c:a aac -b:a 96k -movflags +faststart tests/evaluation/clips/clip-2/clip-2.mp4
```

## Before you press record

```powershell
$env:SLEUTH_DATA_MODE = "fixture"
pnpm dev
```

In a second PowerShell window, open the repo root and make the font large. Close mail and chat. Nothing secret on screen.

## Take

Start recording. Run `powershell -ExecutionPolicy Bypass -File tests/evaluation/clips/clip-2/demo.ps1`. Press Enter at each step while you speak. Leave a short pause after each line.

Do not run any other command while you say line 5. Do not show an upload link from anywhere else.

| Step on screen             | Say this                                                        |
| -------------------------- | --------------------------------------------------------------- |
| (start)                    | 1. This is the SLEUTH API running on my laptop in fixture mode. |
| 1. Make a copy of the demo | 2. First I make an editable copy of the demo project.           |
| 2. Replace the script      | 3. Next I replace the script with two short lines.              |
| 3. Set a checklist         | 4. Then I set a checklist with two items.                       |
| (screen stays on step 3)   | 5. Now I ask for an upload link for the new video.              |
| 4. Start the analysis      | 6. After that I start the analysis.                             |
| 5. Check the job status    | 7. Finally I check the job status.                              |

Stop recording. Check the length is 60 to 120 seconds. If it is too short, record again with longer pauses; do not add lines.

## After the take

1. Run `powershell -ExecutionPolicy Bypass -File tests/evaluation/clips/clip-2/finalise.ps1 -StoredAt "<shared drive link>"`. It fills the length, date, hash and link in `clip.json`.
2. Do not run SLEUTH or `pnpm eval` on it yet. Wait at least an hour so you label what the clip shows, not what you remember planning.
3. Watch it from start to end and write `labels.json` (`docs/evaluation-protocol.md`, "Labelling a clip in 20 minutes"), then set `labelledBy` in `clip.json` to your name. Commit `labels.json` on its own before any evaluation run.
4. Run `pnpm test`. The recording and its labels land in the same PR.
