# SLEUTH coordination board

Owner: coordinator session. Updated: Saturday 14 November 2026, about 12:30 SGT, by Đăng's builder session. Source: `origin/main` `bcba5e0`, read with git and `gh`, and `tasks.md` on that commit.

Dates (SGT): feature freeze Wed 2 Dec 23:59 (18 days). UI freeze Sun 29 Nov (D-15). Internal submit Fri 4 Dec 18:00. Official deadline Sat 5 Dec 06:00. Kiro credits request closes Wed 2 Dec 04:00.

## 1. Git and GitHub

| Item | State |
|---|---|
| `origin/main` | `bcba5e0`. CI green on `bcba5e0` (`check`, `db`). |
| Merged 13 to 14 Nov | #29 to #32, #33 (submission groundwork and keep-alive), #34 (speech-only worker mode), #35 to #37, #38 (prod-e2e team-account mode). |
| Open PRs | #27 (Đạt, guest sign-in). Conflicts with `main` in the journal only. Đạt merges `main` into it. |
| Keep-alive | `keep-alive` workflow green on `main` (`bcba5e0`, manual run), so the `DATABASE_URL` secret works. The cause of the old `psql` error (`error 2`) is unknown; the workflow now uses the worker's driver. |
| Worker workflow | Manual only. Every job is speech only unless `VIDEO_ANALYSIS_OWNER_IDS` lists a real team account. Turning the schedule on is Đăng's step. |

## 2. Spec ticks at `bcba5e0`

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
| Đăng | #29 to #38 merged (all his). Guest-flow check 14 of 14 on sleuth-dev against #27's code. prod-e2e rehearsal on dev in guest mode: 9 PASS, 1 SKIP; speech-only findings 2 of 2. Keep-alive green. | Live production checks (his shell); recording kit for clips 1 to 3; brief 006 for Đạt. | #27 deploy, for the guest-flow check only. | Đạt's revamp is unblocked (theme on `main`). |
| Đạt | #26 merged. #27 open. | #27: merge `main`, re-run the browser specs. Then brief 006 (UI revamp). | Nobody. | Live guest sign-in (#27). Real video player. Clips 4 and 5 (ea 14, 15). |
| Bảo | Last push 12 Nov 00:39 UTC (#25). | #34 (his area) merged 14 Nov; review after the fact requested. | Unknown; no reply. | ea 11 (protocol, labels for clips 1 to 3), ea 13 (first evaluation). No accuracy numbers until these run. |

## 4. Critical path: one real run on production

What needs #27: only the browser guest-flow check (`scripts/guest-flow-check.ts`). The smoke test part B and `scripts/prod-e2e.ts` sign in through the Supabase API, not the browser, so they can run on production now.

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | A guest signs in, creates a project and uploads | API path proven on production; browser path proven on dev only | Production API: smoke test 32 of 32, 13 Nov (reported by Đăng). Browser: `scripts/guest-flow-check.ts` 14 of 14 on sleuth-dev against #27's code, 13 and 14 Nov. Live browser: waits for #27. |
| 2 | The worker takes the job, transcribes and finds evidence | Proven on sleuth-dev; **unproven on production** | prod-e2e rehearsals with a local worker, 13 and 14 Nov: job `succeeded`. Guest mode on production settings: worker `speechOnly=1`. Production: Đăng's shell run pending. |
| 3 | Findings show on the timeline with the video | API counts proven on dev; player not wired | Playback URL route on `main` (#31); the demo answers `{ url: null, expiresAt: null }` on the live site (checked by Đăng). Player: brief 006 for Đạt. |
| 4 | Resolve one finding | Proven once on dev | 13 Nov rehearsal resolved a Cursed Frame. Guest mode cannot prove it (speech only gives no candidate to review); needs the team-account run. |
| 5 | Edit one sentence: only its evidence goes stale | Proven on dev | 14 Nov rehearsal: 1 modified line, its 1 evidence item stale, nothing else changed. Guest mode has no evidence to stale. |
| 6 | Export the Final Seal | Blockers and CSV proven on dev | Seal 409 with `uncovered_items`; `report.csv` 30 rows. A sealed project not reached. |

Earliest step not proven on production: **step 2, the first real job** (prod-e2e in guest mode, Đăng's shell).

## 5. Top five risks

1. No real job has run on production. 18 days to freeze.
2. Bảo has been silent since 12 Nov. ea 11 and 13 are his. No accuracy numbers exist.
3. The UI revamp lands two weeks before freeze. `midnight` stays a one-line rollback.
4. Local database tests fail when run all at once: our own parallel test files open more connections than the sleuth-dev session pooler allows (peak 23 backends on 14 Nov). CI uses its own database and stays the gate.
5. Free-tier limits: Supabase Free pauses after 7 quiet days (keep-alive covers prod only); Gemini 3.8 Flash failed on the free tier; the Deepgram credit is one-time.

## 6. Merge order for open PRs

1. #27 (Đạt), after Đạt merges `main` into it: unlocks the live guest-flow check.
2. Đăng's new PRs from 14 Nov (board, brief 006, clip kits, script tests): docs and tests, any order.

## 7. Briefs, reviews, decisions

- Briefs: 003 done. 004: code done (#30, #31, #32, #34, #38); live runs pending. 005: #33 merged. 002b: #34 merged. 006: UI revamp for Đạt.
- Decisions: see `decisions-needed.md`. Open: D-10, D-11. Decided: D-12 (14 Nov), D-13 to D-18.
- Cleanup: `docs/coordination/cleanup.md`.
