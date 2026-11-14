# Evaluation protocol

SLEUTH is only as good as the numbers we can show. This page says how the clips in `tests/evaluation/clips/` are recorded and labelled, and how `pnpm eval` scores them. Only numbers that `pnpm eval` prints may be quoted, with the number of clips and the provider names beside them (evidence-analysis requirement 7.4).

## The rules

1. **We record every clip ourselves.** No third-party footage.
2. **Label before you run.** The person who labels a clip watches it from start to end and writes `labels.json` first. Do not run SLEUTH or `pnpm eval` on the clip before the labels are written, and do not copy anything from tool output into the labels. A label written after seeing the tool's answer is not a test.
3. **Say who did what.** `clip.json` names who recorded the clip, who labelled it and when. The table at the end of this page repeats it.
4. **Videos stay out of Git** (`*.mp4` is ignored) unless a file is under 5 MB. `clip.json` says where the copy lives and its SHA-256, so anyone can check they have the same file.
5. **Length:** 60 to 120 seconds, English, one video per clip. The product limit is 180 seconds.
6. **Nothing secret on screen or in the audio.**
7. **Voice.** The narration may be the recorder's own voice or a disclosed text-to-speech voice (decided by Đăng, 14 November, #66). Never a cloned or imitated real person's voice. The clip table names the voice of every clip.

### Limit: a synthetic voice makes the results optimistic

Clips 1 to 3 are narrated by a text-to-speech voice (Microsoft Zira). A clean synthetic voice, with even pace, clear pauses and no background noise, is easier for speech recognition than a person talking during a real demo. So every result that depends on the transcript (Phantom Dialogue, reordered and unscripted lines, and the time windows used to match frames) is likely **better than it would be on real demos**. Every place that quotes `pnpm eval` numbers says how many clips used a synthetic voice, beside the numbers.

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
pnpm eval -- --write-doc             # also put clips, precision, recall and false-warning rate into docs/evidence-confidence.md
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

## Labelling a clip in 20 minutes

For the person who did **not** record the clip. Do this before anyone runs `pnpm eval` on it.

1. Open `tests/evaluation/clips/<name>/clip.json`. Read the numbered script and the checklist once (2 minutes).
2. Watch the whole video once, without stopping, with sound (the clip is at most 2 minutes).
3. Watch it again. Keep `clip.json` open and, for each script line, ask: was it said (in any wording)? For each checklist item: was it shown on screen? Write down line and item numbers as you go (6 minutes).
4. Write `labels.json` next to `clip.json`. Use the four finding types in the table above, plus `unscripted` and `reordered`. One entry per problem. Count from 1. Leave out anything you are unsure about; an empty list is fine (8 minutes).
5. Add `labelledBy` (your name) and `labelledOn` (today). Commit only `labels.json`, in its own commit, before anyone runs the evaluation.
6. Do not run `pnpm eval -- --providers real` per clip. The real run happens once, on all five labelled clips (evidence-analysis 13, #67), because the Deepgram credit is used once. After that run, do not edit the labels, even if you think a label was wrong. Write what you think in the results write-up instead.

The number printed at the end, and the clip count beside it, go into `docs/evidence-confidence.md` with `pnpm eval -- --write-doc`. Nobody types those numbers by hand.

## Clips

| Clip | Case | Recorded by | Voice | Labelled by | State |
|---|---|---|---|---|---|
| `example` | Hand-written text only; tests the harness | nobody (no video) | none (no audio) | hand-written, not watched | Done. Not counted as one of the five clips. |
| `clip-1` | Plain demo of one screen | Đạt (@phatdat220707) | synthetic (Microsoft Zira) | Phạm Quốc Bảo (@baofrovn) | Recorded 14 Nov (90 s), checked against the kit in #58; to label |
| `clip-2` | One deliberately missing step | Đạt (@phatdat220707) | synthetic (Microsoft Zira) | Phạm Quốc Bảo (@baofrovn) | Recorded 14 Nov (74 s), checked in #58; to label |
| `clip-3` | One security claim | Đạt (@phatdat220707) | synthetic (Microsoft Zira) | Phạm Quốc Bảo (@baofrovn) | Recorded 14 Nov (85 s), checked in #58; to label |
| `clip-4` | Two lines said in the wrong order | Đạt (@phatdat220707) | not recorded yet | Phạm Quốc Bảo (@baofrovn) | To record by 24 Nov (task 14); labeller agreed (#66) |
| `clip-5` | One sentence not in the script | Đạt (@phatdat220707) | not recorded yet | Phạm Quốc Bảo (@baofrovn) | To record by 24 Nov (task 15), kit in `clips/clip-5`; labeller agreed (#66) |

Recorder and labeller are never the same person. Phạm Quốc Bảo (@baofrovn) labels all five clips, including clips 4 and 5, and records none of them (#58, #66). Labels are due 2 days after each drive link: clips 1 to 3 by Fri 20 Nov, clips 4 and 5 by Thu 26 Nov (SGT).
