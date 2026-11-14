# SLEUTH coordination board

Owner: coordinator session. Updated: Saturday 14 November 2026, afternoon, by Đăng's builder session. Source: `origin/main` `357186c`, read with git and `gh`. Production results in section 4 were reported by Đăng.

Dates (SGT): feature freeze Wed 2 Dec 23:59 (18 days). UI freeze Sun 29 Nov (D-15). Internal submit Fri 4 Dec 18:00. Official deadline Sat 5 Dec 06:00. Kiro credits request closes Wed 2 Dec 04:00.

## 1. Git and GitHub

| Item | State |
|---|---|
| `origin/main` | `357186c`. Merged 14 Nov: #39 to #42, #27 (Đạt, guest sign-in), #43 (worker schedule, ADR 0009), #44 (handover). |
| Merged 13 to 14 Nov | #29 to #44, all but #27 by Đăng. |
| Open PRs | #45 (our own evidence clip for prod-e2e steps 7 and 8), #46 (strong borders, finding icons, 404 and error pages). Both by Đăng. |
| Keep-alive | `keep-alive` workflow green on `main` (`bcba5e0`, manual run), so the `DATABASE_URL` secret works. The cause of the old `psql` error (`error 2`) is unknown; the workflow now uses the worker's driver. |
| Worker workflow | Scheduled every 10 minutes (#43, ADR 0009). Every job is speech only unless `VIDEO_ANALYSIS_OWNER_IDS` lists a real team account. Manual runs 43555627213 and 43555808634 on 14 Nov: both green. |

## 2. Spec ticks at `bcba5e0`

| Spec | Ticked | Open |
|---|---|---|
| ingestion | 10/10 | none |
| change-impact | 10/10 | none |
| final-seal | 10/10 | none |
| review-workspace | 14/14 | none |
| evidence-analysis | 12/16 | 11, 13, 14, 15 (Đạt; 11 and 13 moved from Bảo on 14 Nov) |

Total 56 of 60.

## 3. Per person

| Person | Done since 13 Nov | Now | Blocked by | Blocking |
|---|---|---|---|---|
| Đăng | #29 to #38 merged (all his). Guest-flow check 14 of 14 on sleuth-dev against #27's code. prod-e2e rehearsal on dev in guest mode: 9 PASS, 1 SKIP; speech-only findings 2 of 2. Keep-alive green. | Live production checks (his shell); recording kit for clips 1 to 3; brief 006 for Đạt. | #27 deploy, for the guest-flow check only. | Đạt's revamp is unblocked (theme on `main`). |
| Đạt | #26 merged. #27 open. | #27: merge `main`, re-run the browser specs. Then brief 006 (UI revamp). | Nobody. | Live guest sign-in (#27). Real video player. Clips 1 to 5 (ea 11, 14, 15): Đạt records all five, clips 1 to 3 by Wed 18 Nov ([issue #58](https://github.com/dngvmnh/sleuth/issues/58)). Đạt labels them too and runs ea 11 and 13 (D-10, changed 14 Nov). |
| Bảo | Last push 12 Nov 00:39 UTC (#25). | #34 (his area) merged 14 Nov; review after the fact requested. | Unknown; no reply. | Nothing on the evaluation since 14 Nov (ea 11 and 13 moved to Đạt). |

## 4. Critical path: one real run on production

Results reported by Đăng on 14 Nov, run in his shell against `https://sleuth-eight.vercel.app` with `main` at `bcba5e0` (plus docs and test PRs #39 to #42).

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | A guest signs in, creates a project and uploads | **API path proven on production.** Browser path proven on dev only | `scripts/prod-smoke.ts` parts A and B: ALL CHECKS PASSED, 14 Nov. prod-e2e steps 1 to 4b passed (anonymous sign-in, project, script, checklist, upload URL 201, our clip uploaded). Browser: `scripts/guest-flow-check.ts` 14 of 14 on sleuth-dev. #27 is merged; the live browser run is not done yet. |
| 2 | The worker takes the job, transcribes and finds evidence | **Proven on production, speech only** | prod-e2e guest mode, 04:14 to 04:17 UTC. The queue check showed only our job. Worker runs 43555627213 and 43555808634 succeeded (`speechOnly=1`, 2 transcript segments, 0 evidence, 3 findings). Script steps 5a and 5b passed (succeeded, 1 attempt). |
| 3 | Findings show on the timeline with the video | **Findings proven on production through the API**; player not wired | Step 6: findings 2 (Ghost 2), "speech-only findings: 2 of 2", evidence 0. Playback URL route answers on the live site. The real player is Đạt's (brief 006). |
| 4 | Resolve one finding | **Unproven on production** | Step 7 SKIP: no open finding tied to undecided evidence, because speech only gives no candidate. Needs the team-account run with a clip that produces evidence (#45). |
| 5 | Edit one sentence: only its evidence goes stale | **Weak on production** | Step 8 passed, but the edited line had no evidence, so it only shows nothing else changed. Needs the team-account run (#45). |
| 6 | Export the Final Seal | Blockers and CSV proven on production | Step 9: seal 409 with `uncovered_items`. Step 10: `report.csv` 30 rows. A sealed project not reached. |

Data rule (D-4) on production: the guest job ran speech only, so no frame reached Gemini.

Earliest step not proven on production: **steps 7 and 8 of prod-e2e (resolve a finding, edit a line with evidence)**. They need the team-account run: a real `sleuth-prod` user listed in `VIDEO_ANALYSIS_OWNER_IDS`, and our own clip that produces evidence (#45). After that: the live browser guest-flow check, and the real player.

Test data: all test projects from these runs were deleted. Six Storage folders remain; see `cleanup.md`.

## 5. Top five risks

1. A real job ran on production only in speech-only mode. No evidence, no resolved finding and no sealed project on production yet. 18 days to freeze.
2. Bảo has been silent since 12 Nov. ea 11 and 13 moved to Đạt on 14 Nov. No accuracy numbers exist.
3. The UI revamp lands two weeks before freeze. `midnight` stays a one-line rollback.
4. Local database tests fail when run all at once: our own parallel test files open more connections than the sleuth-dev session pooler allows (peak 23 backends on 14 Nov). CI uses its own database and stays the gate.
5. Free-tier limits: Supabase Free pauses after 7 quiet days (keep-alive covers prod only); Gemini 3.8 Flash failed on the free tier; the Deepgram credit is one-time.

## 6. Merge order for open PRs

1. #45 our own evidence clip for prod-e2e: needed for the team-account run (steps 7 and 8).
2. #46 strong borders, finding icons and error pages.

## 7. Briefs, reviews, decisions

- Briefs: 003 done. 004: code done (#30, #31, #32, #34, #38); live runs pending. 005: #33 merged. 002b: #34 merged. 006: UI revamp for Đạt.
- Decisions: see `decisions-needed.md`. Open: D-10, D-11. Decided: D-12 (14 Nov), D-13 to D-18.
- Cleanup: `docs/coordination/cleanup.md`.
