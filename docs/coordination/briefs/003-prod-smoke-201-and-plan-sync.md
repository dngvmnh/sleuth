# BRIEF 003 (A): fix the smoke test, sync the deploy plan, catch up local `main`

Date: 13 November 2026. Owner: Đăng. Written by the coordinator. Do this first: it is small and it keeps the next two briefs from fighting stale files.
Paste everything below the line into the backend-builder session.

---

You are the SLEUTH backend engineer. PowerShell on native Windows, no `&&` chaining, English everywhere, no AI mentions in commits or docs. Repo: `C:\Data\Singapore\SMU\Sleuth\sleuth` (the inner repo; the outer `Sleuth` folder is the SMU repo). Never print, log or commit `.env`, `.env.local` or any key. Free tiers only. Never force-push. One commit per step.

## Why

On 13 November (outside Kiro, verified by Đăng) production was fixed and checked:
- `sleuth-prod` had no storage bucket (deploy-plan step 1.3 was never done). The bucket `video-assets` now exists: private, 50 MB limit, MIME types `video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`.
- `scripts/prod-smoke.ts` expected 200 from `createUploadUrl`, but the contract declares 201 (`packages/contracts/src/endpoints.ts`). Fixed in the working tree, not committed.
- Production smoke test, parts A and B: all checks passed, 32 of 32.
- Test projects `zz-test-ec48xl`, `zz-test-836d6a`, `zz-test-eu60zn` were deleted. Two 4 KB files remain in Storage, in folders `prj-0mwetmijy0001-78237676` and `prj-0mweu1pmk0001-c9e4ae11`. Đăng deletes them by hand in the dashboard (SQL cannot delete Storage objects).

Local `main` is 9 commits behind `origin/main`, with that one uncommitted change in `scripts/prod-smoke.ts`.

## Do

1. `git fetch origin`. Save a copy of the local change first: `git diff scripts/prod-smoke.ts > $env:TEMP\prod-smoke-201.patch`.
2. Carry the change to a new branch from `origin/main`: `git switch -c fix/prod-smoke-201 origin/main`. If git refuses because the file differs, run `git restore scripts/prod-smoke.ts`, switch, then `git apply $env:TEMP\prod-smoke-201.patch`. The final diff must match the saved patch: the "signed upload URL issued" check expects `201`, with a comment naming the contract.
3. Commit: `test(deploy): expect 201 from createUploadUrl`.
4. Update `docs/deploy-plan.md`:
   - Step 1.3: list all four MIME types (add `video/x-matroska`) and add a verify line: Supabase, Storage, Buckets, `video-assets`: Public off, limit 50 MB, four types listed. Say the API accepts the same four types, so the bucket must too.
   - Section 5: add "Production check, 13 November 2026": root cause (no bucket), the 32 of 32 result, and which rows are now proven on production (anonymous sign-in, create, upload through the API, two-user isolation, 50 MB cap and type refusal at the bucket). Mark the 10 November rows that this replaces. Say "reported by Đăng; run in Đăng's shell".
   - The row "No secret in the page or its JS": after PR #27 the page legitimately holds the Supabase Project URL and the anon key (public by design, ADR 0006). Say these two are expected and keep forbidding `service_role`, `sb_secret_`, `postgres://` and any provider key. Do not change the claim into something untrue today: PR #27 is not merged yet, so write it as "after #27".
   - Section 7 (cleanup): add that Storage objects must be deleted in the dashboard, and list the two folders above.
   Commit: `docs(deploy): bucket step, 13 November production check, cleanup of Storage objects`.
5. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Do not run `scripts/prod-smoke.ts` part B and do not set the production URL or key. Part A may run (no keys needed).
6. Push the branch and open a PR (title under 70 characters). No label needed. Wait for `check` and `db` to be green.
7. Fast-forward local `main`: `git switch main`, `git pull --ff-only origin main`. If the working tree has other uncommitted changes, stop and tell me; do not stash or reset them.

## Allowed to change

`scripts/prod-smoke.ts`, `docs/deploy-plan.md`, `docs/kiro-engineering-journal.md` (one entry). Nothing else. If the brief is wrong or too big, stop and say why.

## Done when (run each command, report the real output; a skipped suite is not a pass)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- `pnpm tsx scripts/prod-smoke.ts` part A passes (no keys needed).
- PR open, assigned to @dngvmnh, `check` and `db` green.
- Local `main` equals `origin/main` and the working tree is clean.

## Do not

- Do not commit to or push `main`. Do not merge the PR; I do.
- Do not tick other people's tasks. No AI co-author trailer.

## Report format (so I can paste it to the coordinator with "verify")

```
BRIEF 003 report
Branch / PR: <name> / <url>
Commits: <hash subject> (one per line)
Done-when results: <command: real result> (one per line)
Not run or skipped: <list, or none>
Files changed: <list>
Only Đăng can do: <list>
```
