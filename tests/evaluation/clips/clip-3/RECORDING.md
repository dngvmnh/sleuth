# Clip 3: recording script (evidence-analysis 11)

For Đạt (@phatdat220707), who records (decision D-10, reassigned from Đăng in issue #58). Phạm Quốc Bảo labels it afterwards by watching; the recorder never labels. One take, your own screen. Narrate in your own voice or with a text-to-speech voice; if it is synthetic, say so (name the voice) when you send the link, so the clip table can list it (#66). Never a cloned or imitated real voice. No third-party footage, nothing secret on screen or in the audio.

## What the clip must test

Line 5 is a security claim: "All stored videos are encrypted at rest." Nothing on screen can prove it. The analysis should mark that line as needing proof from outside the video (Needs Outside Proof), never as shown.

Say it as a plain statement after step 3. Do not show any settings page, document or screen that seems to back it up.

## The file

| Item         | Value                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| Length       | 60 to 120 seconds                                                                        |
| Language     | English                                                                                  |
| Format       | MP4, H.264 video, AAC audio, 1280x720 or 1920x1080, 30 fps                               |
| File name    | `clip-3.mp4`                                                                             |
| Put it in    | `tests/evaluation/clips/clip-3/clip-3.mp4` (Git ignores `*.mp4`, so it is not committed) |
| Copy kept at | the team's shared drive; write the link when you run `finalise.ps1`                      |

Record with the Windows Snipping Tool (screen recording, microphone on) or OBS. If the file is not H.264 and AAC, convert it:

```powershell
ffmpeg -i raw.mp4 -vf scale=-2:720 -r 30 -c:v libx264 -crf 28 -c:a aac -b:a 96k -movflags +faststart tests/evaluation/clips/clip-3/clip-3.mp4
```

## Before you press record

```powershell
$env:SLEUTH_DATA_MODE = "fixture"
pnpm dev
```

In a second PowerShell window, open the repo root and make the font large. Close mail and chat. Nothing secret on screen.

## Take

Start recording. Run `powershell -ExecutionPolicy Bypass -File tests/evaluation/clips/clip-3/demo.ps1`. Press Enter at each step while you speak. Leave a short pause after each line.

Say line 5 exactly as written, with no screen change while you say it.

| Step on screen               | Say this                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| (start)                      | 1. This is the SLEUTH API running on my laptop in fixture mode. |
| 1. Make a copy of the demo   | 2. First I make an editable copy of the demo project.           |
| 2. List the evidence         | 3. Next I list the evidence for the copy.                       |
| 3. Confirm one candidate     | 4. Then I confirm the first candidate as a person.              |
| (after step 3)               | 5. All stored videos are encrypted at rest.                     |
| 4. Show the coverage         | 6. Now I ask for the coverage summary.                          |
| 5. Try the Final Seal        | 7. After that I try to apply the Final Seal.                    |
| 6. Open the printable report | 8. Finally I open the printable report.                         |

Stop recording. Check the length is 60 to 120 seconds. If it is too short, record again with longer pauses; do not add lines.

## After the take

1. Run `powershell -ExecutionPolicy Bypass -File tests/evaluation/clips/clip-3/finalise.ps1 -StoredAt "<shared drive link>"`. It fills the length, date, hash and link in `clip.json`.
2. Do not watch it for labels yourself and do not run SLEUTH or `pnpm eval` on it. Send the drive link to Phạm Quốc Bảo.
3. Phạm Quốc Bảo watches it from start to end and writes `labels.json` (`docs/evaluation-protocol.md`), then sets `labelledBy` in `clip.json`.
4. Run `pnpm test`. The recording and its labels land in the same PR.
