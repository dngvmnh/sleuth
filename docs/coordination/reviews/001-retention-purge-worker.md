# Review 001: retention purge in the worker

Reviewer: Phạm Quốc Bảo (@baofrovn). Author: Đăng (@dngvmnh). Date: 9 November 2026.
Asked for by: ADR 0008, "Scheduler" (worker side). Merged earlier without this review (PR #6).

## What was checked

| Item | How |
|---|---|
| `apps/worker/src/retention.ts` read in full | Read the file and `index.ts` wiring. |
| `apps/worker/src/retention.test.ts` | Read it, ran it (`pnpm exec vitest run apps/worker`, 4 tests pass). |
| ADR 0008, decision and consequences | Read the text and compared it with the code. |
| Worker start-up in `index.ts` | Read how the timer, its database pool and shutdown fit together. |

## What is right

- A purge runs at start and then every `RETENTION_INTERVAL_MS` (default one hour) with `ANONYMOUS_RETENTION_DAYS` (default 7), as the ADR says.
- Two purges never overlap (the `running` flag), and a failure is caught, logged and retried on the next tick.
- Logs hold counts and the error class name only. No project id, name, path or error text (the test feeds a secret path and checks it stays out).
- The timer is `unref`ed, so it alone cannot keep the process alive, and `--once` runs skip it.
- The timer gets only `purgeExpiredAnonymousProjects`, not the whole store.

## Findings

| # | Finding | Severity | Suggestion |
|---|---|---|---|
| 1 | `stop()` clears the interval but does not wait for a purge that is running. At shutdown `index.ts` closes the retention database pool after `stop()`, so an in-flight purge can fail with a closed-pool error and log `retention_failed`. Nothing is lost (the next run repeats the purge), but the log line is noise. | Low | Let `stop()` return a promise that resolves when the current run ends, and `await` it in `index.ts` before closing the pool. |
| 2 | With more than one worker (for example two Fly machines), every worker runs the purge every hour. Deleting an already deleted project is a no-op and the storage removal ignores missing files, so this is safe, only repeated work. | Info | Nothing now. If it matters, take a Postgres advisory lock around the run. |
| 3 | The cutoff is `created_at`, so an anonymous user who is still working on day 7 loses the project. This matches the ADR, but the visitor sees no warning. | Product | Decide whether the UI should say "kept for 7 days". It is not a code problem. |
| 4 | A purge can delete a project (and its video) while a job for it is running. The handler then fails with `load: job_not_found`, `write: job_not_found` or `download: http_error` and the loop's `fail` call changes nothing. No bad data is written; the job row goes with the project. | Info | Nothing. Covered by the handler's error mapping. |
| 5 | The start-up wiring in `index.ts` (timer created only outside `--once`, pool closed in `finally`) has no test. | Low | Acceptable for now; the pieces are tested. |

## Not checked

- The SQL and the storage batching inside `purgeExpiredAnonymousProjects` (in `packages/db`, Đăng's area, covered by his tests in the CI `db` job). I read none of it.
- Behaviour against a real Supabase project with real anonymous users.

## Verdict

Approved. Findings 1 and 5 are optional follow-ups; none blocks anything.

Related, not part of this review: the worker's claim query takes any queued job, including the seeded demo job `job-demo-1`. In supabase mode it would claim that job and fail it with `demo_read_only` three times. Whether the claim should skip demo projects is a question for Đăng.
