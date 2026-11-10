# BRIEF 002b, media-builder (Phạm Quốc Bảo): "no video analysis" worker mode

Date: 10 November 2026. Owner: Phạm Quốc Bảo (@baofrovn). Written by Đăng. (The file name shares the number 002 with `002-backend-finish-loop.md`; that brief is finished.)
Paste everything below the line into your media-builder session.

---

You are the SLEUTH media engineer. PowerShell on native Windows, no `&&` chaining, English everywhere, no AI mentions in commits or docs. Repo: `C:\Data\Singapore\SMU\Sleuth\sleuth`. Never push to `main`. One branch and one PR, branch `feat/worker-speech-only-mode`.

## Why

Decision D-4 (`docs/coordination/decisions-needed.md`): we use free tiers only. The Gemini free tier may use content to improve Google's products, and `.kiro/steering/ai-safety.md` says visitors' videos are not kept or used for training. So:

- A visitor's video goes to Deepgram only. No frame is ever sent to Gemini for a visitor.
- Our own recorded clips may use Gemini, because we own the footage.

Today the worker has no way to tell these apart. `VIDEO_ANALYSIS_PROVIDER=gemini` sends every job's frames to Gemini. Until this mode exists, `.github/workflows/worker.yml` stays manual-only and prod must not run a real worker on visitor uploads.

## What to build

1. New value `none` for `VIDEO_ANALYSIS_PROVIDER` in `apps/worker/src/config.ts` and `providers.ts`. With `none`, the worker:
   - does not extract frames (skip `extractFrames`, so no frame files exist at all),
   - never builds a Gemini client and never reads `VIDEO_ANALYSIS_API_KEY`,
   - runs the pipeline on the transcript only (speech-only analysis).
2. `none` is the safe default in supabase mode. If `VIDEO_ANALYSIS_PROVIDER` is unset or `mock` in supabase mode, keep today's refusal (`provider_not_configured`). Do not let a missing setting fall back to `gemini`.
3. Per-job rule, so our own clips can still use Gemini: with `VIDEO_ANALYSIS_PROVIDER=gemini`, send frames to Gemini only when the project's `ownerId` is listed in a new setting `VIDEO_ANALYSIS_OWNER_IDS` (comma separated user ids; empty means nobody). Any other owner, and any anonymous owner, is speech-only. The demo project is never re-analysed.
4. The evidence engine must handle "no frames" without inventing anything. A claim that needs a screen proof (an on-screen click, a visible number) gets no candidate from speech alone, so it stays `uncovered` and the finding says it was checked by speech only. Nothing may reach `confirmed`; only a person does that (`review.ts`).
5. Record the mode on the job result so the UI can say "Checked by speech only". If that needs a new field on a shared contract, it is a contract change: label the PR `contract-change`, regenerate `docs/api/openapi.yaml`, and ask Đăng to review. Prefer a field that already exists if one fits.

## Tests (no network, no keys)

- `createProviders` with `none`: returns a video provider that is never called; no key needed; no Gemini import is constructed.
- A job on a project owned by a user not in `VIDEO_ANALYSIS_OWNER_IDS`: the fake Gemini client records zero calls and `extractFrames` is not called.
- A job on a project owned by a listed user: Gemini is called (fake client).
- Anonymous owner (`ownerId` null or an anonymous user): zero Gemini calls.
- Property test: for any owner id and any list, Gemini is called only if the owner is in the list.
- Logs and errors hold ids and counts only (grep the test output for the fake key and fake transcript text).

## Also in this PR (small, same files)

- Retry and fallback for the Gemini free tier: on 5xx or timeout, retry; after the last retry, fall back to `gemini-3.6-flash`. Reason: on 10 November `gemini-3.8-flash` failed 3 of 3 tries and `gemini-3.6-flash` worked in 3 of 4 (`decisions-needed.md`, D-4). Change the code default of `VIDEO_ANALYSIS_MODEL` accordingly, or keep 3.8 as primary with the fallback; your call, state it in the PR.
- Amend ADR 0007 to the free-tier rule and the data rule above. Then you may tick evidence-analysis 3.
- Cost ceiling for evidence-analysis 10: the call cap exists (`createCallBudget`); add a per-job cost ceiling or say in the PR why the free tier needs none.

## Gate

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts`, `pnpm build`, and `node tools/kiro-hooks/hook.mjs ghost-scan`. Wait for both CI jobs (`check`, `db`) to be green. Add a journal entry with the real numbers. Tick only your own tasks.

## Done when

- A visitor job in supabase mode with `VIDEO_ANALYSIS_PROVIDER=none` finishes with a transcript-only result and zero frame files and zero Gemini calls.
- Đăng can then switch `.github/workflows/worker.yml` to a schedule (it is commented out today) and set the secrets.

## Do not

- Do not send frames of a visitor's video to any third party.
- Do not log keys, transcripts, frame content or signed URLs.
- Do not touch `packages/domain/src/review.ts` or any code that sets evidence to `confirmed`.
- Do not tick other people's tasks.
