# Human actions

Only a person can do these. Tick an item when it is done. Updated 14 November 2026. Times are Singapore time (SGT). Đăng is unavailable 22 to 23 Nov, 1 Dec and 2 Dec.

Shell rule: run every command in PowerShell on native Windows, from a clean worktree of `origin/main`. Set secrets in that shell only. Never paste a secret into chat, a file or a commit.

## Đăng (@dngvmnh)

### Now to Wed 18 Nov

- [ ] Delete the 5 Storage folders in `sleuth-prod`, bucket `video-assets` (Supabase dashboard, Storage, Buckets, `video-assets`, select, Delete): `prj-0mwetmijy0001-78237676`, `prj-0mweu1pmk0001-c9e4ae11`, `prj-0mweuyda80001-70352397`, `prj-0mwfvix7w0001-47e2cd39`, `prj-0mwfw7s890001-e7c1b662`. Full steps: `docs/coordination/cleanup.md`.
- [ ] Set the repository variable `VIDEO_ANALYSIS_OWNER_IDS` (GitHub, Settings, Secrets and variables, Actions, Variables) to the team account's user id. Our own clips then use Gemini frames. Visitors stay speech-only.
- [ ] Check that the worker runs by itself: GitHub, Actions, `worker`. After PR #43 is merged, a run should start within 10 to 15 minutes without a click.
- [ ] Record clips 1 to 3 (decision D-10). Kits: `tests/evaluation/clips/clip-1` to `clip-3`, start with `RECORDING.md`. Finish with `finalise.ps1`. Bảo labels them; you must not.

### Team-account production check (WP3)

Run in your own PowerShell, from a clean worktree of `origin/main`, with the production values set in that shell only:

1. Make the clip: `powershell -File scripts/make-evidence-clip.ps1` (available after WP3 is merged). It writes our own footage; no third-party material.
2. Add the team user, then run `pnpm tsx scripts/prod-e2e.ts` in team-account mode with the clip. The exact options are in the header of `scripts/prod-e2e.ts`.
3. Paste the PASS, FAIL and SKIP lines into the chat. Steps 7 and 8 must be PASS.
4. Delete the test projects it prints, by id, with `docs/coordination/cleanup.md`.

### Before Fri 20 Nov

- [ ] Re-seed the demo project on production (WP6). Steps are written in `docs/coordination/wp6-demo-reseed.md` once it is merged. It is a migration-safe script; you run it, not the agent.

### Later

- [ ] Request Kiro credits before Wed 2 Dec 04:00.
- [ ] Open both Supabase projects once a week (`sleuth-dev` has no ping).
- [ ] Thu 3 Dec: final production smoke (`pnpm tsx scripts/prod-smoke.ts`) and the team-account e2e. Paste the lines.

## Phạm Quốc Bảo (@baofrovn)

- [ ] Label clips 1 to 3 against `docs/evaluation-protocol.md` by Sat 21 Nov. About 20 minutes per clip. Do not label a clip you recorded.
- [ ] Then run `pnpm eval --providers real` on them, and send the table to Đăng.

## Đạt (@phatdat220707)

- [ ] Record clips 4 and 5 by Tue 24 Nov (ea 14, ea 15).
- [ ] Record the demo-video footage by Mon 30 Nov, following `docs/submission/demo-script.md`.
- [ ] Check the UI on a phone and on a laptop after each UI PR is deployed. Note anything that is cut off or unreadable.

## Everyone

- [ ] Confirm student status for Best Student Project: school, degree, year, student email, LinkedIn. Put the answers in a private place, not in the repo.
- [ ] Confirm the age-of-majority rule (21 in Singapore). If anyone is younger, ask the organisers.
- [ ] Đăng confirms whether one person may enter two projects (DEAD AIR and SLEUTH), then the team picks categories.

## Submission (all by Fri 4 Dec 18:00)

- [ ] Record and edit the video (under 3 minutes). Upload it to YouTube as public.
- [ ] Publish the blog post (`docs/submission/blog.md`) and the social post (`docs/submission/social.md`, starts with `#KiroweenHackathon26`).
- [ ] Fill in Devpost from `docs/submission/devpost.md`.
- [ ] Add the live URL, the repository URL, the video, the blog URL and the social URL.
- [ ] Submit.
- [ ] After the video and the Devpost entry are done: tag `v1.0.0`.
