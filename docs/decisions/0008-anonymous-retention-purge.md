# 0008 Anonymous retention purge

## Context
ADR 0006 lets visitors try their own video through Supabase anonymous sign-in. Those projects hold uploaded videos and scripts nobody will come back for. Ingestion requirement 5.4 says an anonymous user's project older than the retention period (default 7 days) is deleted with its rows and stored files.

## Decision
- `purgeExpiredAnonymousProjects(now, days)` lives on both stores (`RetentionStore` in `packages/db/src/store.ts`). It is not part of `ProjectStore`, so no API route can call it.
- "Anonymous" means the owner is a Supabase Auth user with `auth.users.is_anonymous = true`. A project whose owner is not in `auth.users` is kept: we only delete what we can prove is anonymous. The demo is never touched.
- Cutoff: `created_at < now - days`. Default `days` is 7 (`ANONYMOUS_RETENTION_DAYS`). A project created exactly at the cutoff is kept.
- Order: storage objects first (in batches of 100), then one `delete from projects`, which cascades to every child table. If storage fails, the rows stay and the next run tries again, so a row is never removed while its file may remain.
- Scheduler: a timer in the worker (`apps/worker`), once an hour, `days = 7`. The worker already runs with the service role and a database pool. Supabase cron (pg_cron) was rejected: it runs inside Postgres and cannot delete Storage objects without an extra Edge Function and a second secret.
- Running the timer at most one hour late is fine: the rule is "older than 7 days", not "exactly at 7 days".

## Consequences
- The worker runs the purge at start and then hourly (`apps/worker/src/retention.ts`, settings `RETENTION_INTERVAL_MS` and `ANONYMOUS_RETENTION_DAYS`), only in supabase mode and not in `--once` runs. Đăng wired it in; Phạm Quốc Bảo reviews it as the worker owner.
- A failed purge leaves data for up to one more hour; it logs ids and counts only.
- Signed-up users' projects are never deleted by this job.
