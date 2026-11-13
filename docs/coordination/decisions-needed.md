# Decisions needed

Updated Friday 13 November 2026, evening. Team rule: free options only for hosting and AI.

## Open

| ID | Decision | Who | By | Recommendation |
|---|---|---|---|---|
| D-4 (rest) | The speech-only worker mode is still not built, so the scheduled worker stays off. | Bảo (build), Đăng (decide the fallback in D-13) | Mon 16 Nov | See D-13. Until it ships, run the worker by hand and only when the queue holds our own jobs. |
| D-10 | Who records clips 1 to 3 (ea 11). | Đăng | Sat 14 Nov | Đăng records clips 1 to 3 (API and database demos, same style as clip 5's `demo.ps1`). Bảo finalises the protocol and labels them by watching, before any run. Đạt keeps clips 4 and 5 (ea 14, 15). Recorder and labeller are different people, which makes the labels more honest. |
| D-11 | What visitors may do at launch. | Đăng | Mon 16 Nov | "Try your own video" is speech-only: Deepgram transcript, no frames to Gemini (D-4 data rule). Our own clips use Gemini through an allow-list of owner ids. Until the mode ships, visitors can sign in and make copies of the demo, but the worker stays off. |
| D-12 | Keep Supabase Free and the worker alive through judging. | Đăng | Wed 18 Nov | Yes. A small scheduled GitHub workflow that makes one cheap query to `sleuth-prod` twice a week, plus the weekly manual look at both projects. Check the pause rule on Supabase's page and quote it in the PR. |
| D-13 | If Bảo has not started brief 002b by Sat 14 Nov noon, who builds it. | Đăng | Sat 14 Nov | Đăng builds it on `feat/worker-speech-only-mode`, tells Bảo, and Bảo reviews. It is the critical path to a scheduled worker, and Đăng's lane is free. |

## Decided

| ID | Decision | Outcome | Where |
|---|---|---|---|
| D-1 | Ingestion 7 upload URL lifetime | Option 3: `expiresAt` is a 5-minute window; analysis refuses a late (`upload_late`) or missing (`upload_missing`) file. | PR #4, ingestion requirement 2.1 |
| D-2 | How to merge PR #1 | Merge commit (`deb6dbc`). | PR #1 |
| D-3 | Postgres in CI | Yes, as a throwaway local Supabase stack in the `db` job, never the shared dev project. | PR #5 |
| D-4 | AI providers on free options only | Deepgram credit and Gemini free tier. Visitors' videos go to Deepgram only. Models: `gemini-3.8-flash` with fallback `gemini-3.6-flash` (PR #22). ADR 0007 accepted for free tiers (PR #24). Owner of both accounts: Đăng. No card on either. | ADR 0007, PR #22, PR #24 |
| D-5 | Hosting on free options only | Vercel Hobby, a GitHub Actions worker, Supabase Free. `sleuth-prod` is production. Upload cap 50 MB (52428800 bytes). Owner: Đăng. | `docs/deploy-plan.md` |
| D-6 | Can one person enter both DEAD AIR and SLEUTH? | Yes. Đăng read the official rules on 9 November 2026: [kiroween.devpost.com/rules](https://kiroween.devpost.com/rules). | Đăng |
| D-7 | Eligibility answers | All three are university students and adults. Phạm Quốc Bảo and Đạt did not register for Kiroween 2025. | Team, 10 Nov |
| D-8 | Who adds the hourly purge to `apps/worker` | Đăng wrote it; Bảo owns the worker going forward. | PR #6, ADR 0008 |

## Facts recorded 13 November (reported by Đăng, verified outside Kiro, not re-checked here)

- Production root cause: `sleuth-prod` had no storage bucket, because deploy-plan step 1.3 was never done. Bucket `video-assets` now exists: private, 50 MB limit, MIME types `video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`. The API accepts `video/x-matroska`, so the bucket must list it. Brief 003 updates step 1.3.
- `scripts/prod-smoke.ts` expected 200 from `createUploadUrl`, but the contract says 201. Fixed locally, not committed. Brief 003 commits it.
- Production smoke test, parts A and B: all checks passed, 32 of 32. That covers anonymous sign-in, two-user isolation, an upload URL with no key, no file name and under 5 minutes, a 4 KB upload, and the bucket refusing a 51 MB file and a text body.
- Test projects `zz-test-ec48xl`, `zz-test-836d6a` and `zz-test-eu60zn` were deleted from `sleuth-prod`.
- Two 4 KB test files remain in Storage, in folders `prj-0mwetmijy0001-78237676` and `prj-0mweu1pmk0001-c9e4ae11`. SQL cannot delete Storage objects: delete them by hand in the dashboard (Storage, `video-assets`).

## Notes kept from earlier

- D-9 (team channel) was dropped on 9 Nov.
- Gemini check of 10 Nov: `gemini-3.8-flash` failed 3 of 3 on the free tier; `gemini-3.6-flash` worked in 3 of 4. The fallback in PR #22 is tested with recorded responses only.
