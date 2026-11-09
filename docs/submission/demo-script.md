# DRAFT: demo video plan

> DRAFT. The flow below needs parts that are not built yet (review workspace UI, real providers, worker handler). Each scene says what it needs. Do not record a scene until its parts are real. No mock output may be shown as if it were real analysis.

Target length: check the official limit in the rules before recording (TODO). Plan for about 3 minutes.

## The idea
We use SLEUTH on its own demo. We record a short demo of a real app with a script and checklist, deliberately leave one checklist step out, say one line that is not in the script, then let SLEUTH find both. A person confirms the findings and applies the Final Seal. Then we edit one sentence and show only that evidence go stale.

## Recording we analyse
Our own screen recording, our own voice. No third-party footage. Use one of the evaluation clips (evidence-analysis 11, 14, 15) or record a new one with the same rules: 60 to 120 seconds, MP4 H.264 and AAC.

## Scenes

| # | Time | On screen | Narration (draft) | Needs |
|---|---|---|---|---|
| 1 | 0:00-0:15 | Title, the five finding types | "Demo videos drift from what they claim. SLEUTH checks." | Nothing new |
| 2 | 0:15-0:40 | Public demo project, signed out | "No login needed to look around." | Review workspace UI (review-workspace 3, 6) |
| 3 | 0:40-1:10 | Try your own video: upload our clip, paste script and checklist, start analysis | "Every match is a candidate, never a verdict." | Upload flow (rw 12), worker handler (ea 12), real providers (ea 10) |
| 4 | 1:10-1:50 | Timeline and Evidence Lantern: a Ghost for the missing step, the unscripted line listed | "It found the step we skipped and the line we added." | Timeline and Lantern (rw 7-9), alignment and matching (ea 5, 6) |
| 5 | 1:50-2:20 | A person confirms or rejects each candidate; a reshoot note | "Only a person signs off." | Exorcism actions (rw 10) |
| 6 | 2:20-2:40 | Final Seal with coverage, then the HTML report | "The seal names who signed, and which video and script." | Final Seal UI (final-seal 6-9) |
| 7 | 2:40-3:00 | Edit one sentence: one Poltergeist, the seal breaks; a cosmetic edit changes nothing | "Change one line, re-check one line." | Script editor (rw 11) |
| 8 | 3:00 | How we used Kiro: specs, steering, hooks, agents | "Built spec by spec with Kiro." | Screen capture of the repo |

## Rules for the video
- Show only output that SLEUTH really produced on that run.
- If a part is still mocked on recording day, say so on screen or cut the scene.
- No secrets, keys, email or chat on screen.
- Record in one sitting per scene; keep the raw files outside Git.
