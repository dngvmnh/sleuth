# BRIEF 004 (B): the earliest unproven steps on the critical path

Date: 13 November 2026. Owner: Đăng. Written by the coordinator. Do after brief 003.
Paste everything below the line into the backend-builder session.

---

You are the SLEUTH backend engineer. PowerShell on native Windows, no `&&` chaining, English everywhere, no AI mentions in commits or docs. Repo: `C:\Data\Singapore\SMU\Sleuth\sleuth`. Never print, log or commit `.env`, `.env.local` or any key, transcript text or signed URL. Free tiers only. Never force-push. One commit per step. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` before each push, and wait for `check` and `db` to be green.

## Goal

One real run on production: a guest signs in in the browser, uploads a real video, the worker transcribes it and finds evidence, findings show on the timeline, one is resolved, one sentence is edited so only its evidence goes stale, the Final Seal is exported. Today step 1 (browser sign-in) is broken on the live site and steps 2 to 6 have never run on production. See `docs/coordination/board.md` section 4.

## Data rule (D-4)

Visitors' videos never reach Gemini. The worker workflow sets `VIDEO_ANALYSIS_PROVIDER: gemini`, so before any worker run, prove the queue holds only our own job (step 4). Never turn on the schedule in `.github/workflows/worker.yml`.

## Step 1: check PR #27 on real Supabase (the condition in review 005)

1. Read `docs/coordination/reviews/005-pr27-guest-sign-in.md`.
2. Write `scripts/guest-flow-check.ts`: a Playwright script (use the Playwright already in the repo) that takes a base URL and prints only PASS or FAIL per check and ids. Checks: signed out, press "Create a project" and see the guest-session label, then a new project; reload and the project is still listed; a second private browser context does not see it; a text file is refused and a small mp4 or webm is accepted on upload.
3. Run it against a local dev server that uses `sleuth-dev` (anonymous sign-ins on): make a separate worktree of `origin/feat/web-anonymous-signin` (`git worktree add`), set `SLEUTH_DATA_MODE=supabase` and the dev values in that shell only, then remove the worktree when done.
4. Tell me the result. If it passes, I tell Đạt to merge #27. Do not merge it yourself.
5. After #27 is merged and Vercel has deployed it, run the same script against `https://sleuth-eight.vercel.app`. It makes one project under a guest user; print its id so I can delete that one row by id. Also run `scripts/prod-smoke.ts` parts A and B again (I run part B in my own shell; give me the lines).
6. Commit the script on `feat/guest-flow-check` and open a PR.

## Step 2: playback URL (missing backend support, contract change)

The API has no playable video URL (`docs/accessibility.md`, known gaps), so Đạt cannot wire the real video player.

1. Add `GET /api/v1/projects/{id}/assets/{assetVersionId}/playback-url` (or the nearest fit to the existing route naming; read `packages/contracts/src/endpoints.ts` first) that returns `{ url: string | null, expiresAt: string | null }`.
2. Access: the project's owner only. The demo project returns `url: null` (its path is a placeholder). A signed-out visitor and another user get the same errors as the other routes. Server-side signed URL from the private bucket, short-lived (propose a lifetime and say why; the worker's download URL is a separate setting).
3. Both stores through the shared contract suite. Fixture store returns `null`. Tests, a property test where it fits, a route test that a non-owner gets no URL.
4. Update `docs/api/openapi.yaml`, regenerate `fixtures/golden/` only if the golden output changes, and run `pnpm check:contracts`.
5. Label the PR `contract-change`. In the description tell Đạt: what to call, that `null` means "no playable video", and that the real player work is his (wire it, then run the keyboard and caption checks).

## Step 3: first real job on production

1. Write `scripts/prod-e2e.ts`. It reads the production Project URL and anon key from the shell (`PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY`), like `scripts/prod-smoke.ts` part B, and never loads `.env.local`. It prints only PASS or FAIL, counts and ids. Steps: sign in anonymously; create a project; set a short script (3 lines) and a checklist (2 items); upload our own clip through the signed URL; start analysis; poll the job until it succeeds, fails or 10 minutes pass; list evidence and findings and print counts by type; resolve one finding through the review call; create a new script version that changes one sentence and check that only evidence tied to that sentence went stale; try the Final Seal and print the blockers or the seal; fetch `report.csv` and print its row count.
2. The clip: use the 6 s clip made for `provider-check.ts` on 10 November if it is still on disk; otherwise tell me and I will record 30 s. It must be our own footage.
3. The queue rule before the worker runs: give me one read-only SQL select for the Supabase SQL editor on `sleuth-prod` that counts queued and running jobs by project owner. I run the worker only when the only queued job is the script's.
4. I run `gh workflow run worker.yml` by hand (you may run it if I say the select shows one job). Read failures with `gh run view --log-failed`. If the cause is code, fix it with a test, commit and push on a branch, and run again.
5. Do not call a step done until the script prints PASS for it. Report the earliest step that fails.

## Step 4: only if brief 002b is still not started

Check `git ls-remote --heads origin feat/worker-speech-only-mode`. If there is no branch and I confirm decision D-13, build `docs/coordination/briefs/002-no-video-analysis-mode.md` exactly as written (branch `feat/worker-speech-only-mode`), tell Bảo in the PR description, and ask Bảo to review. Otherwise skip this step.

## Allowed to change

Step 1: `scripts/guest-flow-check.ts`, `package.json` script entry only if no new dependency is needed. Step 2: `packages/contracts/`, `packages/db/`, `apps/web/app/api/`, `docs/api/openapi.yaml`, tests, and `fixtures/golden/` only if the golden output must change. Step 3: `scripts/prod-e2e.ts`, plus worker or db fixes the run proves necessary, with a test each. Always: one journal entry per PR. A new dependency, a secret, a paid service or a change to a fixed decision means stop and ask.

## Done when (run each command, report the real output; a skipped suite is not a pass)

- Step 1: `scripts/guest-flow-check.ts` prints PASS for every check against the local dev server; later against the live site.
- Step 2: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts`, `pnpm build` pass, and `check` and `db` are green on the PR with the `contract-change` label.
- Step 3: `scripts/prod-e2e.ts` prints PASS per step, or names the earliest step that fails with the worker log cause.
- Each PR is assigned to @dngvmnh. Spec tasks are ticked only when their own "done when" is met.

## Do not

- Do not commit to or push `main`; work on a new branch from `origin/main` (my local `main` is behind). Do not merge PRs; I do.
- Do not touch `packages/domain/src/review.ts` or any code that sets evidence to `confirmed`.
- Do not send any visitor's video to Gemini. Production checks run with variables set in the shell for that command only; clear them afterwards.
- No AI co-author trailer. Stop only if a check still fails after two different fix attempts, or if you need a secret, a paid service, or a change to a fixed decision or contract.

## Report format (so I can paste it to the coordinator with "verify")

```
BRIEF 004 report
Branch / PR per step: <name> / <url>
Commits: <hash subject> (one per line)
Done-when results: <command: real result> (one per line)
Critical path: <step 1..6: proven / unproven / broken, with evidence>
Earliest step not proven: <step>
Not run or skipped: <list, or none>
Only Đăng can do: <exact clicks and lines for my shell>
```
