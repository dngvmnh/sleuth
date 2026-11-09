# Decisions needed

Updated Monday 9 November 2026. Each item: who decides, by when, state.

## Open

| ID | Decision | Who | By | Recommendation |
|---|---|---|---|---|
| D-4 | Team-owned AI provider account with a hard monthly cap. Who owns it, what cap. | Team | Fri 13 Nov | One account, one owner (Bảo), cap set before any adapter runs on real footage. |
| D-5 | Hosting plan: web host, Docker worker host with FFmpeg, paid Supabase tier from 1 Dec. | Team | Fri 20 Nov | See `docs/deploy-plan.md`. Decide by 20 Nov so deploy is rehearsed before 30 Nov. |
| D-6 | Two entries: can one person submit both DEAD AIR and SLEUTH? | Đăng | Wed 11 Nov | Pending a reading of the official rules. |
| D-7 | Eligibility answers from each member: student status, Kiroween 2025, age of majority. | Each member | Wed 11 Nov | Each posts one line. Do not guess for anyone. |
| D-9 | Name the daily-update channel for the async post (done, contract changes, blocked, next PR). | Team | Mon 9 Nov | Any one channel. |

## Decided

| ID | Decision | Outcome | Where |
|---|---|---|---|
| D-1 | Ingestion 7 upload URL lifetime | Option 3: `expiresAt` is a 5-minute window; analysis refuses a late (`upload_late`) or missing (`upload_missing`) file. | PR #4, ingestion requirement 2.1 |
| D-2 | How to merge PR #1 | Merge commit (`deb6dbc`). | PR #1 |
| D-3 | Postgres in CI | Yes, as a throwaway local Supabase stack in the `db` job, never the shared dev project. | PR #5 |
| D-8 | Who adds the hourly purge to `apps/worker` | Đăng wrote it; Bảo owns the worker going forward. | PR #6, ADR 0008 |
