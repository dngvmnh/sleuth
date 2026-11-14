# Clip 5: recording script (evidence-analysis 15)

For Đăng (@dngvmnh). One take, your own screen. Narrate in your own voice or with a text-to-speech voice; if it is synthetic, say so (name the voice) when you send the link, so the clip table can list it (#66). Never a cloned or imitated real voice. No third-party footage.

## What the clip must test

You read the 8 script lines below and add **one sentence of your own** that is not in the script. The analysis should list that sentence as an unscripted line (evidence-analysis 3.4).

The extra sentence must be unscripted. Do not write it down, plan its words or rehearse it. Say it after step 3, about what is on the screen. It must not repeat or paraphrase a script line. If you notice you planned it, record again.

## The file

| Item         | Value                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| Length       | 60 to 120 seconds                                                                        |
| Format       | MP4, H.264 video, AAC audio, 1280x720 or 1920x1080, 30 fps                               |
| File name    | `clip-5.mp4`                                                                             |
| Put it in    | `tests/evaluation/clips/clip-5/clip-5.mp4` (Git ignores `*.mp4`, so it is not committed) |
| Copy kept at | the team's shared drive; write the link when you run `finalise.ps1`                      |

Record with the Windows Snipping Tool (screen recording, microphone on) or OBS. If the file is not H.264 and AAC, convert it:

```powershell
ffmpeg -i raw.mp4 -vf scale=-2:720 -r 30 -c:v libx264 -crf 28 -c:a aac -b:a 96k -movflags +faststart tests/evaluation/clips/clip-5/clip-5.mp4
```

## Before you press record

```powershell
$env:SLEUTH_DATA_MODE = "fixture"
pnpm dev
```

In a second PowerShell window, open the repo root and make the font large. Close mail and chat. Nothing secret on screen.

## Take

Start recording. Run `powershell -ExecutionPolicy Bypass -File tests/evaluation/clips/clip-5/demo.ps1`. Press Enter at each step while you speak.

| Step on screen            | Say this                                                        |
| ------------------------- | --------------------------------------------------------------- |
| (start)                   | 1. This is the SLEUTH API running on my laptop in fixture mode. |
| 1. Create a project       | 2. First I create a new project called Clip Five.               |
| 2. Save a script          | 3. Next I save a short script with two lines.                   |
| 3. Set a checklist        | 4. Then I set a checklist with two items.                       |
| (after step 3)            | **your own sentence, unplanned**                                |
| 4. Ask for an upload link | 5. Now I ask for an upload link for the video.                  |
| (link shown)              | 6. The link is only good for five minutes.                      |
| 5 and 6. Analysis and job | 7. Finally I start the analysis and check the job.              |
| (status shown)            | 8. The job is queued, so the worker can pick it up.             |

Stop recording. Check the length is 60 to 120 seconds.

## After the take

1. Run `powershell -ExecutionPolicy Bypass -File tests/evaluation/clips/clip-5/finalise.ps1 -StoredAt "<shared drive link>"`. It fills the length, date, hash and link in `clip.json`.
2. Watch the clip once, start to end. Do not run SLEUTH on it first.
3. Write `labels.json` from what you saw and heard: the exact words of your extra sentence and roughly when (seconds), any script line you skipped or changed, and which checklist items are shown. Use the format from evidence-analysis 9 (`docs/evaluation-protocol.md`, task 11) once it exists.
4. Set `labelledBy` in `clip.json` to your name.
5. Run `pnpm test`, open a PR, ask Đăng to review the format only, then tick task 15.
