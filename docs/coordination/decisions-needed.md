# Decisions needed

Updated Saturday 14 November 2026, noon, by Đăng. Team rule: free options only for hosting and AI.

## Open

| ID | Decision | Who | By | Recommendation |
|---|---|---|---|---|
| D-10 | Who records clips 1 to 3 (ea 11). | Đăng | Wed 18 Nov | **Đăng's recommendation:** Đăng records clips 1 to 3 by Wed 18 Nov (API and database demos, the same style as clip 5's `demo.ps1`). Bảo writes the protocol and labels them by watching, before any run. Đạt keeps clips 4 and 5 (ea 14, 15). The recorder and the labeller are different people, which keeps the labels honest. |
| D-11 | What visitors may do at launch. | Đăng | Mon 16 Nov | "Try your own video" is speech-only: Deepgram transcript, no frames to Gemini (D-4 data rule). Our own clips use Gemini through an allow-list of owner ids (`VIDEO_ANALYSIS_OWNER_IDS`, PR #34). |

## Decided

| ID | Decision | Outcome | Where |
|---|---|---|---|
| D-1 | Ingestion 7 upload URL lifetime | Option 3: `expiresAt` is a 5-minute window; analysis refuses a late (`upload_late`) or missing (`upload_missing`) file. | PR #4, ingestion requirement 2.1 |
| D-2 | How to merge PR #1 | Merge commit (`deb6dbc`). | PR #1 |
| D-3 | Postgres in CI | Yes, as a throwaway local Supabase stack in the `db` job, never the shared dev project. | PR #5 |
| D-4 | AI providers on free options only | Deepgram credit and Gemini free tier. Visitors' videos go to Deepgram only. Models: `gemini-3.8-flash` with fallback `gemini-3.6-flash` (PR #22). ADR 0007 accepted for free tiers (PR #24). Owner of both accounts: Đăng. No card on either. The speech-only worker mode that enforces the data rule is PR #34. | ADR 0007, PR #22, PR #24, PR #34 |
| D-5 | Hosting on free options only | Vercel Hobby, a GitHub Actions worker, Supabase Free. `sleuth-prod` is production. Upload cap 50 MB (52428800 bytes). Owner: Đăng. | `docs/deploy-plan.md` |
| D-6 | Can one person enter both DEAD AIR and SLEUTH? | Yes. Đăng read the official rules on 9 November 2026: [kiroween.devpost.com/rules](https://kiroween.devpost.com/rules). | Đăng |
| D-7 | Eligibility answers | All three are university students and adults. Phạm Quốc Bảo and Đạt did not register for Kiroween 2025. | Team, 10 Nov |
| D-8 | Who adds the hourly purge to `apps/worker` | Đăng wrote it; Bảo owns the worker going forward. | PR #6, ADR 0008 |
| D-12 | Keep Supabase Free and the worker alive through judging | Yes. The keep-alive workflow (PR #33) runs one read-only query against `sleuth-prod` on Mondays and Thursdays, through the worker's own driver. It is green on `main` (`bcba5e0`), so the `DATABASE_URL` secret works. Đăng still opens both projects once a week; `sleuth-dev` has no ping. Decided 14 Nov. | PR #33, `docs/deploy-plan.md` |
| D-13 | Bảo had not started brief 002b; who builds it | Đăng built it on 13 Nov: PR #34 (`feat/worker-speech-only-mode`), merged on 14 Nov. Bảo was asked to review. | PR #34 |
| D-14 | New look: default for launch, or a skin for the video only? | Default for launch, behind a `data-theme` attribute on `<html>`, so it rolls back in one line. Decided by Đăng, 14 Nov. | Item 5 (theme foundations) |
| D-15 | Who does the revamp? | Đạt builds components and screens. Đăng does tokens, fonts, icons and the contrast test. UI freeze Sun 29 Nov. Decided by Đăng, 14 Nov. | Item 5 |
| D-16 | Art | Original SVG and CSS only. No stock or generated images unless the rights are recorded. Decided by Đăng, 14 Nov. | Item 5 |
| D-17 | Brand colour | Forest black, cream text and amber action, with a spectral teal for AI candidates (theme `hollow`). The current violet set stays as the fallback theme (`midnight`). Decided by Đăng, 14 Nov. | `apps/web/styles/tokens.css` |
| D-18 | Copy | Plain QA copy. No gamified words. Every spooky label keeps its plain label. Decided by Đăng, 14 Nov. | Đạt's screens |

## Facts recorded 13 November (reported by Đăng, verified outside Kiro, not re-checked here)

- Production root cause: `sleuth-prod` had no storage bucket, because deploy-plan step 1.3 was never done. Bucket `video-assets` now exists: private, 50 MB limit, MIME types `video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`. Step 1.3 is updated (PR #29, merged).
- Production smoke test, parts A and B: all checks passed, 32 of 32.
- Test data still to delete: see `docs/coordination/cleanup.md` (PR #35).

## Notes kept from earlier

- D-9 (team channel) was dropped on 9 Nov.
- Gemini check of 10 Nov: `gemini-3.8-flash` failed 3 of 3 on the free tier; `gemini-3.6-flash` worked in 3 of 4. The fallback in PR #22 is tested with recorded responses only.
