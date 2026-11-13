# SLEUTH coordination board

Owner: coordinator session. Updated: Saturday 14 November 2026, about 01:30 SGT, by Đăng's builder session. Source: `origin/main` `395f490`, read with git and `gh`, and `tasks.md` on that commit.

Dates (SGT): feature freeze Wed 2 Dec 23:59 (18 days). UI freeze Sun 29 Nov (D-15). Internal submit Fri 4 Dec 18:00. Official deadline Sat 5 Dec 06:00. Kiro credits request closes Wed 2 Dec 04:00.

## 1. Git and GitHub

| Item | State |
|---|---|
| `origin/main` | `395f490`. Merged on 13 Nov evening: #29 (smoke test expects 201, deploy-plan sync), #31 (owner-only playback URL, `contract-change`), #30 (guest-flow check script). |
| Open PRs (Đăng) | #32 prod-e2e script; #33 submission groundwork and keep-alive; #34 speech-only worker mode (review requested from Bảo); #35 cleanup list; and this PR. `main` was merged into #32 to #35 on 14 Nov (journal: both sides kept). |
| Open PRs (Đạt) | #27 guest sign-in. Conflicts with `main` in the journal only. Needs Đạt to merge `main` into it. |
| Worker workflow | Manual only. Schedule off until #34 is merged. |

## 2. Spec ticks at `395f490`

| Spec | Ticked | Open |
|---|---|---|
| ingestion | 10/10 | none |
| change-impact | 10/10 | none |
| final-seal | 10/10 | none |
| review-workspace | 14/14 | none |
| evidence-analysis | 12/16 | 11, 13 (Bảo); 14, 15 (Đạt) |

Total 56 of 60.

## 3. Per person

| Person | Done since 13 Nov | Now | Blocked by | Blocking |
|---|---|---|---|---|
| Đăng | #29, #30, #31 merged. #32 to #35 open, CI green before the main merge. Guest-flow check 14 of 14 PASS on sleuth-dev against #27's code. prod-e2e rehearsal on sleuth-dev: 9 PASS, 1 SKIP. Leak check of both scripts: 0 secrets, signed URLs or transcript strings in the output. | Theme foundations (D-14 to D-18 decided). | `DATABASE_URL` secret (Đăng's own click) for keep-alive and the worker. #27 deploy for the live checks. | Đạt (theme tokens, fonts and icons for the revamp). |
| Đạt | #26 merged (review-workspace 14 ticked). #27 open. | #27: merge `main`, re-run the browser specs. | Nobody. | Live sign-in on the site (#27). Real video player (playback URL is on `main` now). Clips 4 and 5 (ea 14, 15). |
| Bảo | Last push 12 Nov 00:39 UTC (#25). | Review of #34 requested. | Unknown; no reply. | ea 11 protocol and labels, ea 13 first evaluation. No accuracy numbers until these run. |

## 4. Critical path: one real run on production

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | A guest signs in in the browser, creates a project and uploads | Proven on sleuth-dev; **unproven on the live site** | `scripts/guest-flow-check.ts` (PR #30, merged) against a local dev server on #27's code with sleuth-dev: 14 of 14 PASS, 13 Nov, and again 14 Nov. Live site: waits for #27 to be merged and deployed. API path on production: 32 of 32, 13 Nov (reported by Đăng). |
| 2 | The worker takes the job, transcribes and finds evidence | Proven on sleuth-dev; unproven on production | `scripts/prod-e2e.ts` (PR #32) rehearsal with a local worker run (Deepgram, gemini-3.6-flash, our own 6.5 s clip): job `succeeded`, 13 and 14 Nov. Production: needs the `DATABASE_URL` secret, the queue check and Đăng's shell. |
| 3 | Findings show on the timeline with the video | Partly: API counts proven on dev; player not wired | Rehearsals listed evidence and findings by type. Playback URL route merged (#31). The real player is Đạt's next task. |
| 4 | Resolve one finding | Proven once on dev | Rehearsal run 1 (13 Nov) resolved a Cursed Frame through the review call. Later runs only produced a Ghost, which has no evidence to review, so step 7 was SKIP. |
| 5 | Edit one sentence: only its evidence goes stale | Proven on dev | Rehearsal 14 Nov: 1 modified line, its 1 evidence item went stale, nothing else changed. |
| 6 | Export the Final Seal | Blockers and CSV proven on dev | Seal answered 409 with `stale_evidence, uncovered_items`; `report.csv` 30 rows. A sealed project was not reached. |

Earliest step not proven on production: **step 1, the browser sign-in on the live site** (waits for #27). Then step 2 (Gate B in brief 004).

## 5. Top five risks

1. No real job has run on production. 18 days to freeze.
2. The `DATABASE_URL` repository secret likely holds the old password (keep-alive `ping` failed with `error 2`). That also breaks the manual worker.
3. Bảo has been silent since 12 Nov. ea 11 and 13 (clips, protocol, first evaluation) are his. No accuracy numbers exist.
4. The UI revamp (D-14 to D-18) lands two weeks before freeze. Keep `midnight` as a one-line rollback.
5. Free-tier limits: Supabase Free pauses after 7 quiet days; Gemini 3.8 Flash failed on the free tier; the Deepgram credit is one-time.

## 6. Merge order for open PRs

1. #32 prod-e2e script: needed for Gate B, touches only `scripts/` and the journal.
2. #35 cleanup list: docs only.
3. #33 submission groundwork: docs and keep-alive. Its `ping` run goes green only after the secret is fixed.
4. #27 (Đạt), after Đạt merges `main` into it: unlocks the live checks.
5. #34 speech-only mode, after Bảo reviews: unlocks the worker schedule.
6. This PR (decisions and board), any time.

## 7. Briefs, reviews, decisions

- Briefs: 003 done (#29). 004: steps 1 to 3 done in code (#30, #31, #32); live runs are gated. 005: #33. 002b: #34.
- Decisions: see `decisions-needed.md`. Open: D-10, D-11, D-12. Decided today: D-13 to D-18.
- Cleanup: `docs/coordination/cleanup.md` (#35).
