# Demo video: shot list and narration (2:50)

Final plan, 14 November 2026. It follows `dogfood-plan.md`: we run SLEUTH on our own demo and show the real result. The official video rules were not readable (the page returned HTTP 403), so Đăng checks the length and language rule before recording. If the limit is shorter than 3:00, cut scene 8 first.

Rules: our own screen, our own voice, no third-party footage or music. Show only output SLEUTH produced on that run. No secrets, keys or emails on screen. The video must go on YouTube as public.

## Scenes

Legend for the last column: LIVE = must be recorded on production (https://sleuth-eight.vercel.app). PUBLIC DEMO = the signed-out demo project on production. REPO = a screen of the repository.

| # | Time | On screen | Narration | Source |
|---|---|---|---|---|
| 1 | 0:00-0:15 | Crime scene: our own demo video playing, a script and a checklist beside it | "Demo videos drift from what they claim. A step is cut, a line is changed. Nobody notices." | Our own recording |
| 2 | 0:15-0:35 | Dashboard, signed out; open the public demo | "No login needed to look around. Every finding has a spooky name and a plain name." | PUBLIC DEMO |
| 3 | 0:35-1:05 | Ghost Detection: sign in as a guest, upload our clip, paste the script and checklist, run the analysis | "Every match is a candidate, never a verdict. This runs on a free schedule, so it can take a few minutes." | LIVE |
| 4 | 1:05-1:35 | Timeline and Evidence Lantern: a Ghost for the skipped step; click a script line and the clock moves; click a marker and the sentence lights up | "It found the step we skipped and the sentence we added." | LIVE, after the worker finished |
| 5 | 1:35-2:05 | Exorcism: a person confirms or rejects each candidate; a reshoot note | "Only a person decides." | LIVE |
| 6 | 2:05-2:25 | Poltergeist: make an editable copy, change one sentence, show only that sentence go stale | "Change one line, re-check one line. A cosmetic edit changes nothing." | LIVE (on a copy) |
| 7 | 2:25-2:45 | Final Seal: coverage, blockers, the wax-seal moment, the report with real numbers | "The seal names who signed, and which video and script versions." | LIVE |
| 8 | 2:45-2:50 | Kiro: specs, steering, hooks, agents in the repository | "Built spec by spec with Kiro." | REPO |

## What must be live production

Scenes 3 to 7 are one real run on production, recorded in a single sitting. The public demo (scene 2) shows no video file (it says "No playable video file") and has no Poltergeist example, which is why scene 6 uses a copy.

## If the real run misbehaves

Use the public demo project and say on screen: "This is the demo project. Our live run on this video did not finish in time." Never edit a result or show mock output as real analysis.

## Before recording

1. The team-account run in `docs/coordination/human-actions.md` passed steps 7 and 8.
2. The worker has run by itself at least once from the schedule (GitHub, Actions, `worker`).
3. Our own clip has a script and checklist written first, one step left out on purpose and one line added.
