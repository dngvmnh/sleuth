# Human actions

Only a person can do these. Tick an item when it is done. Updated 14 November 2026, evening. Times are Singapore time (SGT). Đăng is unavailable 22 to 23 Nov, 1 Dec and 2 Dec.

Shell rule: run every command in PowerShell on native Windows, from a clean worktree of `origin/main`. Set secrets in that shell only. Never paste a secret into chat, a file or a commit.

## Đăng (@dngvmnh)

### Done 14 Nov (verified on production)

- [x] Storage cleanup in `sleuth-prod`: the `video-assets` bucket is empty, and there are no `zz-test-*` projects and no active jobs.
- [x] `VIDEO_ANALYSIS_OWNER_IDS` (GitHub, Settings, Secrets and variables, Actions, Variables) is set to the team account's user id. Our own clips use Gemini frames; visitors stay speech-only.
- [x] Production guest-flow check of PR #27 against `https://sleuth-eight.vercel.app`: 13 of 13 PASS.
- [x] Team-account `scripts/prod-e2e.ts` on production with the evidence clip: ALL STEPS PASSED, steps 7 and 8 included. The demo's findings were repaired first (`docs/coordination/cleanup.md` section 3) and stayed intact after the run.
- [x] Repository description, homepage and topics are set.

### Open

- [x] **The worker starts by itself.** Fixed 14 Nov after the token was corrected: a guest run answered `worker dispatch: sent`, GitHub started a `workflow_dispatch` run at once, and the job succeeded about 50 seconds later. If a later run answers anything other than `sent`, go through the token checks in `docs/deploy-plan.md` (401 wrong or expired token, 403 Actions not "Read and write", 404 token cannot see `dngvmnh/sleuth`).

### Later

- [ ] Request Kiro credits before Wed 2 Dec 04:00.
- [ ] Open both Supabase projects once a week (`sleuth-dev` has no ping).
- [ ] **Thu 3 Dec: final production check.** In your own PowerShell, from a clean worktree of `origin/main`: `powershell -ExecutionPolicy Bypass -File scripts/final-prod-check.ps1`. It asks for the production Project URL and publishable key (public values) and the team e-mail and password (never shown, never stored). It runs the smoke test, then the team-account e2e with the evidence clip. If the worker dispatch word is not `sent`, it tells you to run the queue check before starting the worker by hand. Paste the PASS/FAIL lines, then delete what it lists at the end (SQL Editor, then Storage). Details: `docs/deploy-plan.md`, section 5d.

## Phạm Quốc Bảo (@baofrovn)

- [ ] Agree to label clips 4 and 5 too (proposed in `docs/evaluation-protocol.md`; Đạt records them, so Đạt cannot label them).
- [ ] Label clips 1 to 3 against `docs/evaluation-protocol.md` by Sat 21 Nov, after Đạt sends the links. About 20 minutes per clip. Do not label a clip you recorded.
- [ ] Then run `pnpm eval --providers real` on them, and send the table to Đăng.

## Đạt (@phatdat220707)

- [ ] Record clips 1 to 3 by Wed 18 Nov ([issue #58](https://github.com/dngvmnh/sleuth/issues/58), reassigned from Đăng, decision D-10). Kits: `tests/evaluation/clips/clip-1` to `clip-3`, start with `RECORDING.md`, finish with `finalise.ps1`. Send the links to Bảo, who labels them; you must not.
- [ ] Record clips 4 and 5 by Tue 24 Nov (ea 14, ea 15).
- [ ] Record the demo-video footage by Mon 30 Nov, following `docs/submission/demo-script.md`.
- [ ] Check the UI on a phone and on a laptop after each UI PR is deployed. Note anything that is cut off or unreadable.

## Submission (all by Fri 4 Dec 18:00)

- [ ] Record and edit the video (under 3 minutes). Upload it to YouTube as public.
- [ ] Publish the blog post (`docs/submission/blog.md`) and the social post (`docs/submission/social.md`, starts with `#KiroweenHackathon26`).
- [ ] Fill in Devpost from `docs/submission/devpost.md`.
- [ ] Add the live URL, the repository URL, the video, the blog URL and the social URL.
- [ ] Submit.
- [ ] After the video and the Devpost entry are done: tag `v1.0.0`.
