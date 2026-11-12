# Evaluation protocol

SLEUTH is only as good as the numbers we can show. This page says how the clips in `tests/evaluation/clips/` are recorded and labelled, and how `pnpm eval` scores them. Only numbers that `pnpm eval` prints may be quoted, with the number of clips and the provider names beside them (evidence-analysis requirement 7.4).

## The rules

1. **We record every clip ourselves.** No third-party footage.
2. **Label before you run.** The person who labels a clip watches it from start to end and writes `labels.json` first. Do not run SLEUTH or `pnpm eval` on the clip before the labels are written, and do not copy anything from tool output into the labels. A label written after seeing the tool's answer is not a test.
3. **Say who did what.** `clip.json` names who recorded the clip, who labelled it and when. The table at the end of this page repeats it.
4. **Videos stay out of Git** (`*.mp4` is ignored) unless a file is under 5 MB. `clip.json` says where the copy lives and its SHA-256, so anyone can check they have the same file.
5. **Length:** 60 to 120 seconds, English, one video per clip. The product limit is 180 seconds.
6. **Nothing secret on screen or in the audio.**

## What goes in a clip folder

```
tests/evaluation/clips/<name>/
  clip.json          the script, the checklist and facts about the recording
  labels.json        what the person saw and heard
  mock-inputs.json   optional: a hand-written transcript and frames for the mock run
  <name>.mp4         the video (not committed)
```

Script lines and checklist items are counted **from 1**, in the order they are listed.

### `clip.json`

```json
{
  "name": "clip-1",
  "durationMs": 74000,
  "labelledBy": "Your name",
  "script": ["First line.", "Second line."],
  "checklist": ["Show the home screen", "Create an invoice"]
}
```

`durationMs` stays `null` until the clip is recorded. A clip with no duration is listed as "not ready" and is not scored. The script must split into exactly the lines you list (one line per sentence, no blank lines). Other fields (`recordedBy`, `recordedOn`, `video`, `case`) are welcome; the harness ignores them.

### `labels.json`

```json
{
  "clip": "clip-1",
  "labelledBy": "Your name",
  "labelledOn": "2026-11-09",
  "findings": [
    { "type": "phantom_dialogue", "scriptLine": 3, "note": "Never said." },
    { "type": "ghost", "checklistItem": 2, "note": "Never shown." },
    { "type": "needs_outside_proof", "scriptLine": 5 },
    { "type": "cursed_frame", "scriptLine": 4 }
  ],
  "unscripted": [{ "atMs": 24000, "note": "Talks about the old laptop." }],
  "reordered": [2]
}
```

| Type | Meaning | Names |
|---|---|---|
| `phantom_dialogue` (Phantom Dialogue: script line not spoken) | The presenter never says this script line, even in other words. | `scriptLine` |
| `ghost` (Ghost: no visual evidence) | The video never shows what this checklist item asks for. | `checklistItem` |
| `needs_outside_proof` (Needs Outside Proof: footage cannot prove this) | The script line makes a claim a recording cannot prove (security, encryption, guarantees, "always", "never"). | `scriptLine` |
| `cursed_frame` (Cursed Frame: needs human check) | The line is spoken and something related is on screen, but you would want a person to look before trusting it: the wording changed, it was said out of order, or the screen only loosely matches. | `scriptLine` |

Also label:

- `unscripted`: a sentence the presenter said that is not in the script. Give the time in milliseconds where you hear it (`atMs`). A leftover spoken segment within 1,500 ms counts as found.
- `reordered`: script lines the presenter said out of the script's order. If two neighbouring lines are swapped, label the one that comes **first in the script** (it was said late).

Leave out anything you did not see. An empty list is a valid label.

### `mock-inputs.json`

For the mock run only: the transcript and the on-screen frames written by hand, in milliseconds from the start.

```json
{
  "transcript": [{ "startMs": 1000, "endMs": 4000, "text": "Welcome to Notely." }],
  "observations": [
    { "timestampMs": 2000, "description": "Home screen with a logo", "onScreenText": ["Notely"] }
  ]
}
```

## Running it

```
pnpm eval                            # mock providers, every ready clip
pnpm eval -- --clips <folder>        # another folder of clips
pnpm eval -- --providers real        # Deepgram and Gemini on the recorded videos (task 13)
```

`--providers real` needs:

- each clip's video at `tests/evaluation/clips/<name>/<name>.mp4` (Git ignores it). A clip without it is skipped, and the run says why;
- FFmpeg on `PATH`;
- `TRANSCRIPTION_API_KEY` and `VIDEO_ANALYSIS_API_KEY` in the environment or in `.env.local` (never committed). Optional: `TRANSCRIPTION_MODEL`, `VIDEO_ANALYSIS_MODEL`, `VIDEO_ANALYSIS_FALLBACK_MODEL`, with the worker's defaults.

It cuts audio and frames exactly as the worker does (one frame every 2 seconds, at most 60, videos over 180 seconds refused before any call), in a temporary folder that is deleted afterwards. The header names the providers and models. It also prints in how many clips Gemini switched to the fallback model. Keys, transcript text and frame descriptions are never printed. Our own clips may go to the Gemini free tier (D-4); visitors' videos never go through this harness.

The run prints a table with one row per finding type (plus unscripted and reordered lines): how many were labelled, how many were found, how many were right, precision and recall with the counts beside them, and then **every** disagreement. A JSON copy goes to `tests/evaluation/results/`, which Git ignores.

- **Precision** is right / found. **Recall** is right / labelled. When the denominator is zero the table says `n/a`, not 0%.
- **Mock numbers test our matching code on hand-written inputs.** They say nothing about how well speech to text or the vision model work. Only a run with real providers measures that, and the table header says which providers produced it.
- A finding counts as right only when both the type and the target (line or checklist item) match.

## Clips

| Clip | Case | Recorded by | Labelled by | State |
|---|---|---|---|---|
| `example` | Hand-written text only; tests the harness | nobody (no video) | hand-written, not watched | Done. Not counted as one of the five clips. |
| `clip-1` | Plain demo of one screen | Phạm Quốc Bảo | Phạm Quốc Bảo | To record (evidence-analysis task 11) |
| `clip-2` | One deliberately missing step | Phạm Quốc Bảo | Phạm Quốc Bảo | To record (task 11) |
| `clip-3` | One security claim | Phạm Quốc Bảo | Phạm Quốc Bảo | To record (task 11) |
| `clip-4` | Two lines said in the wrong order | Đạt (@phatdat220707) | Đạt | To record (task 14) |
| `clip-5` | One sentence not in the script | Đăng (@dngvmnh) | Đăng | Prepared, not recorded (task 15) |
