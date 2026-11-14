# Demo video: shot list and narration (2:50)

Updated 14 November 2026 for the new screens (brief 007). It follows `dogfood-plan.md`: we run SLEUTH on our own demo and show the real result. The official video rules were not readable (the page returned HTTP 403), so Đăng checks the length and language rule before recording. If the limit is shorter than 3:00, cut scene 8 first.

Rules: our own screen, our own voice, no third-party footage or music. Show only output SLEUTH produced on that run. No secrets, keys or emails on screen. The video must go on YouTube as public.

## Scenes

Legend for the last column: LIVE = must be recorded on production (https://sleuth-eight.vercel.app). PUBLIC DEMO = the signed-out demo project on production. Its results are **seeded output** from the golden fixture, not a live analysis, and the narration says so. REPO = a screen of the repository.

| # | Time | On screen | Narration | Source |
|---|---|---|---|---|
| 1 | 0:00-0:12 | Crime scene: our own demo video playing, a script and a checklist beside it | "Demo videos drift from what they claim. A step is cut, a line is changed. Nobody notices." | Our own recording |
| 2 | 0:12-0:32 | Dashboard hero, signed out: "The cut is haunted." and the coverage line. Click the clue card: the demo workspace opens on that line. Back on the dashboard, pick Cursed Frame in the findings cabinet | "This is the public demo, with sample results we prepared. Every finding has a spooky name and a plain one, and says how to clear it." | PUBLIC DEMO (seeded output) |
| 3 | 0:32-0:55 | Sign in as a guest. In the tabs: Upload our clip, paste the script in Script and the checklist in Checklist, then Run analysis in Analysis | "Every match is a candidate, never a verdict. This runs on a free schedule, so it can take a few minutes." | LIVE |
| 4 | 0:55-1:25 | The claims map after the run: rooms covered, candidate waiting, no proof yet. Click the "no proof yet" room for the step we skipped: the Lantern opens beside it. Night wind is on; press Play on the video and the wind goes quiet, then comes back on Pause | "It found the step we skipped and the sentence we added. The night wind goes quiet so you hear the demo itself." | LIVE, after the worker finished |
| 5 | 1:25-1:55 | In the Lantern: a person confirms one candidate, rejects one, and asks for a reshoot with a note | "Only a person decides." | LIVE |
| 6 | 1:55-2:15 | Poltergeist: make an editable copy, change one sentence in the Script tab, and only that room turns "stale after edit" | "Change one line, re-check one line. A cosmetic edit changes nothing." | LIVE (on a copy) |
| 7 | 2:15-2:42 | "The final seal": no locked doors left, the coverage ledger, Apply the Final Seal and the wax seal pressed, and the report with the run's real numbers | "The seal names who signed, and which video and script versions." | LIVE |
| 8 | 2:42-2:50 | Kiro: specs, steering, hooks, agents in the repository | "Built spec by spec with Kiro." | REPO |

## What must be live production

Scenes 3 to 7 are one real run on production, recorded in a single sitting. The public demo (scene 2) shows seeded results, has no video file (it says "No playable video file") and has no Poltergeist example, which is why scene 6 uses a copy.

The Night wind in scene 4 is generated in the browser and is off by default. Turn it on with one click before pressing Play, and keep its volume low so the narration stays clear.

## Numbers on screen

Show only numbers SLEUTH printed on that run. Do not say or show an accuracy figure unless the table from issue #67 is in `docs/evaluation-results.md`, and then only exactly as it was printed.

## If the real run misbehaves

Use the public demo project and say on screen: "This is the demo project with sample results. Our live run on this video did not finish in time." Never edit a result or show mock output as real analysis.

## Before recording

1. The team-account run in `docs/coordination/human-actions.md` passed steps 7 and 8.
2. The worker has run by itself at least once from the schedule (GitHub, Actions, `worker`).
3. Our own clip has a script and checklist written first, one step left out on purpose and one line added.
4. One full rehearsal on the live site, in a clean browser profile with notifications off.
