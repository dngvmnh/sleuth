# DRAFT: dogfood plan for our own demo video

> DRAFT. Team-plan principle 6: we run SLEUTH on our own submission video and show the real Final Seal report in that video. We never fake a result.

## Official video requirements: NOT READ YET

The rules page ([kiroween.devpost.com/rules](https://kiroween.devpost.com/rules)) and the main page returned HTTP 403 to the page reader on 13 November 2026. So the length, language and required contents are not quoted here. **Đăng reads the page and pastes the exact rule text here, with its section name.** Until then, `docs/submission/demo-script.md` plans about 3 minutes, and that is a plan, not the rule.

## Order

1. Write the demo script and the checklist first. They are what SLEUTH checks the video against.
2. Record the video from that script.
3. Run SLEUTH on the recording on production, with the real worker (`gh workflow run worker.yml` by hand, after the queue check in `scripts/prod-e2e.ts`).
4. Review the findings as a person, apply the Final Seal, export the report.
5. Show that real result in the video.

## Dates (SGT)

| Date | Step | Owner |
|---|---|---|
| Wed 25 Nov | Demo script and checklist locked | Đăng (OPEN: confirm) |
| Sun 29 Nov | Production stable and rehearsed end to end (`scripts/prod-e2e.ts` passes) | Đăng |
| Mon 30 Nov | Record | OPEN: who records, who narrates |
| Tue 1 Dec | Analyse the recording on production; review; seal | Đăng |
| Wed 2 Dec 23:59 | Feature freeze | All |
| Thu 3 Dec | Final edit | OPEN |
| Fri 4 Dec 18:00 | Submit (internal deadline; official deadline Sat 5 Dec 06:00) | Đăng |

## People

- Who records the screen: OPEN.
- Who narrates: OPEN. The voice must be one of us, never a synthetic voice passed off as a person.
- Who reviews the findings in the app on camera: OPEN.

## Files

- Videos stay out of Git (`*.mp4` is not committed). Keep the raw recording, the analysed upload and the final edit in the team drive. OPEN: Đăng names the folder.
- In the repo, keep only the demo script, the checklist text and the exported report, after checking that the report holds no private data.

## Our clip, our rules

- Only our own screen and our own voice. No third-party footage or music.
- Our own recording may use the Gemini free tier (decision D-4). Visitors' videos never do.
- Before the worker runs, the queue check must show only our job.

## Fallback if the real run misbehaves

- If the worker fails or the findings are wrong, we show the public demo project instead. We say on screen: "This is the demo project. Our live run on this video did not finish in time." We show the real failure in the journal.
- We never edit a result, add a finding by hand, or show mock output as a real analysis.
