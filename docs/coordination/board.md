# SLEUTH coordination board

Owner: coordinator session. Updated: Friday 13 November 2026, evening. Source: `origin/main` `62e2332` (read with git and `gh`; nothing was checked out and no lint, test or build was run, because the builder session was working). Facts marked "reported" come from Đăng and were not re-checked here.

Dates (SGT): feature freeze Wed 2 Dec 23:59 (19 days). Internal submit Fri 4 Dec 18:00 (21 days). Official deadline Sat 5 Dec 06:00. Kiro credits request closes Wed 2 Dec 04:00.

## 1. Git and GitHub

| Item | State |
|---|---|
| `origin/main` | `62e2332`. CI green on the last six runs (`check`, `db`). |
| Merged since 10 Nov | #20 (Đăng, upload size and type limits). #22 to #25 (Bảo, 12 Nov): Gemini fallback model, retention stop fix, ADR 0007 accepted, `pnpm eval --providers real`. |
| Open PRs | #26 (Đạt, accessibility follow-up, ticks review-workspace 14). #27 (Đạt, anonymous guest sign-in). Both opened 13 Nov, CI green, mergeable, no review yet. They conflict with each other in `docs/kiro-engineering-journal.md` only. |
| Stale branches | `chore/coordination`, `feat/change-impact-9-supabase`, `feat/ci-supabase-db`, `feat/ea-15-clip-prep`, `feat/ingestion-10-worker-purge`, `feat/ingestion-7-upload-window`, `feat/upload-size-type-limits`, `feat/web-test-tooling` are merged and can be deleted. |
| Local checkout (Đăng) | `main` is 9 commits behind `origin/main`. One uncommitted change: `scripts/prod-smoke.ts` (201 instead of 200). Brief 003 fixes both. |
| Worker workflow | One run ever: manual, 9 Nov, green, no job in the queue. Schedule is off on purpose (see risk 3). |

## 2. Ticked versus really done (spec ticks at `62e2332`)

| Spec | Ticked | Open | Checked against code |
|---|---|---|---|
| ingestion | 10/10 | none | Store and route tests in CI. Live: upload URL, 50 MB cap and bucket refusals proven on production on 13 Nov (reported, 32 of 32). |
| change-impact | 10/10 | none | Shared contract suite runs on both stores in the `db` job. Live on production: not run. |
| final-seal | 10/10 | none | UI merged in #21. Seal rules covered by tests. Live: not run. |
| review-workspace | 13/14 | 14 | Task 14 is ticked inside #26. Not on `main` yet. |
| evidence-analysis | 12/16 | 11, 13 (Bảo); 14, 15 (Đạt) | Tasks 3, 7, 10, 12, 16 are ticked and the code exists (`supabase-handler.ts` with a DB test, `pg-queue.ts` with a DB test, both adapters, outside-proof terms). They are proven by tests with recorded responses or a local database. No job has ever run on production. No clip is recorded: there is no `clip-1` to `clip-4` folder and `clip-5` holds only its recording kit. |

No false tick found. Overall: 55 of 60 spec tasks ticked on `main`; 56 after #26.

## 3. Per person

| Person | Finished since 10 Nov | Doing now | Blocked by | Blocking |
|---|---|---|---|---|
| Đăng | #20 merged (10 Nov). Prod bucket fixed and smoke test 32/32 (13 Nov, reported). Worker run, board, reviews, briefs. | Local `main` behind, one uncommitted fix. | Nothing outside. Own queue: #26, #27 (review), the Storage cleanup. | Đạt (#27 merge needs my real-Supabase check). Đạt (no playable video URL in the API). |
| Đạt | #21 merged (10 Nov). #26 and #27 opened and green (13 Nov). | Waiting for review of #26 and #27. | Đăng (review and check). | Live visitors (no sign-in until #27). Clips 4 and 5 (nobody has started them). |
| Bảo | #22 to #25 merged 11 to 12 Nov (evidence-analysis 3, 7, 10 ticked; real-provider eval mode). | Nothing visible. No open PR. Last push 12 Nov 08:39 SGT. | Unknown. Ask today. | Speech-only worker mode (brief 002b, not started: no branch, no `none` provider in `apps/worker`). Scheduled worker. Clips 1 to 3 and the first evaluation (ea 11, 13), so no accuracy numbers for Devpost. |

Is Đăng blocking anyone? Yes, on two points:
1. #27 is the critical path and the PR asks me to run a real-Supabase check before merge. Review 005 says how.
2. The API has no playable video URL (`docs/accessibility.md`, known gaps), so the real video player cannot be wired. That is backend work: brief 004, step 3.

Is anyone doing ea 14 and ea 15? No. Both are Đạt's. There is no `clip-4` folder and `clip-5` has only the recording kit from #8.

## 4. Critical path: one real run on production

Target: upload a real video, the worker transcribes it and finds evidence, findings show on the timeline, resolve one, edit one sentence so only its evidence goes stale, export the Final Seal.

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | A visitor signs in as a guest in the browser, creates a project and uploads | **Broken** in the browser. Proven through the API only | Live site has no sign-in until #27 (review 003). API: anonymous sign-in, two-user isolation, 4 KB upload, bucket refuses 51 MB and text, 32 of 32 (13 Nov, reported). #27's cookie path is not verified on real Supabase. |
| 2 | Worker takes the job, Deepgram transcribes, Gemini reads frames, evidence is found | Unproven | The worker has never run a job on production. Real providers were checked only by `provider-check.ts` on a 6 s clip (10 Nov). The Gemini fallback (#22) is tested with recorded responses only. |
| 3 | Findings show on the timeline with the video | Unproven | Demo project loads signed out on production (part A). A real job's findings: not run. The API has no playable video URL. |
| 4 | Resolve one finding | Unproven on production | Fixture end-to-end and API tests pass (per PR bodies). |
| 5 | Edit one sentence: only its evidence goes stale | Unproven on production | Contract suite on both stores in CI. |
| 6 | Export the Final Seal | Unproven on production | Fixture end-to-end and seal tests. |

Earliest step not proven: **step 1, the browser sign-in, create and upload on the live site.** Next: step 2, the first real job.

## 5. Top five risks

1. No real job has run on production. 21 days left. The first run will find bugs. Do it by Tue 17 Nov (brief 004).
2. Visitors cannot write on the live site until #27 is merged and its cookie path is checked on real Supabase.
3. Data rule (D-4): the manual worker workflow sets `VIDEO_ANALYSIS_PROVIDER: gemini`, so it would send any queued visitor's frames to Gemini. Speech-only mode is not built. Keep the worker manual and run it only when the queue holds our own jobs.
4. Bảo has been quiet since 12 Nov and holds speech-only mode, the protocol, three clips and the first evaluation. No accuracy numbers exist yet. Matching quality on real speech is unmeasured.
5. Free-tier limits: Gemini `3.8-flash` failed 3 of 3 on 10 Nov (fallback to `3.6-flash` is not proven live); Supabase Free pauses after 7 quiet days; the Deepgram credit is one-time.

## 6. Week plan, 14 to 20 November

Rule for all lanes: small PRs, CI green, journal entry, tick `tasks.md` in the same PR. Dependency adds: one person at a time.

### Lane BACKEND, INTEGRATION and SUBMISSION: Đăng (@dngvmnh)
| Day | Work |
|---|---|
| Sat 14 | Brief 003 (smoke test 201, deploy-plan sync, local `main`). Merge #26. Run the real-Supabase check on #27 (review 005), then merge it. Delete the two test files in Storage by hand. Ask Bảo for status. |
| Sun 15 | Light. Brief 004 step 2: guest-flow check script. |
| Mon 16 | Run the guest-flow check on production. Brief 004 step 3: playback URL (contract change, PR). |
| Tue 17 | Brief 004 step 4: first real job on production with our own clip. |
| Wed 18 | Record and label clips 1 to 3 if decision D-10 is yes. Keep-alive workflow (brief 005). |
| Thu 19 | If Bảo has not started speech-only mode: build it (decision D-13). Kiro usage write-up. |
| Fri 20 | Dogfood plan. Board and decisions. Review week's PRs. |

### Lane FRONTEND: Đạt (@phatdat220707)
| Day | Work |
|---|---|
| Sat 14 | After review: merge #26, then merge `main` into #27 (keep both sides of the journal), re-run the end-to-end specs on the last commit, and merge. |
| Mon 16 | Record clip 5 (ea 15) from `tests/evaluation/clips/clip-5/RECORDING.md`. |
| Tue 17 | Record clip 4 (ea 14). Label both before running the tool. |
| Wed 18 to Fri 20 | Wire the real video player when the playback URL lands. Fix what the first real job shows. Start the 3 outside tester plan for 30 Nov. |

### Lane MEDIA: Phạm Quốc Bảo (@baofrovn)
| Day | Work |
|---|---|
| Sat 14 | Reply with status and a date for each item. |
| Mon 16 | Brief 002b, speech-only worker mode, one PR. |
| Tue 17 to Thu 19 | ea 11: protocol final, label clips 1 to 3 (Đăng records, decision D-10). |
| Fri 20 | ea 13 setup: `pnpm eval --providers real` on the clips that exist. |

### Cross-cutting
- Everyone requests Kiro credits before Wed 2 Dec 04:00. Not confirmed for anyone.
- Weekly: open both Supabase projects so neither pauses.

## 7. Briefs and reviews

- Briefs: `003-prod-smoke-201-and-plan-sync.md` (do first), `004-first-real-job-and-playback.md`, `005-submission-groundwork.md`. Older: 001 and 002 (finished), `002-no-video-analysis-mode.md` (open, Bảo).
- Reviews: `004-pr26-accessibility-followup.md` (approve), `005-pr27-guest-sign-in.md` (approve the code; check on real Supabase before merge).
- Decisions: see `decisions-needed.md`. Open today: D-10, D-11, D-12, D-13.
