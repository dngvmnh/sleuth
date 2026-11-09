# Decisions needed

Updated 9 November 2026. Each item: who decides, by when, my recommendation.

| ID | Decision | Who | By | Recommendation |
|---|---|---|---|---|
| D-1 | Ingestion 7: signed upload URLs live 2 hours, spec says 5 minutes. Accept 2 hours, upload through our own short-lived endpoint, or refuse at analysis time files that landed more than 5 minutes after the URL was made. | Đăng | Wed 11 Nov | Third option. Cheapest, keeps the spec's intent, no new endpoint. Update requirement 2.4 in the same PR if you pick another. |
| D-2 | How to merge PR #1: merge commit, squash or rebase. | Đăng | Mon 9 Nov | Merge commit. Local `main` is already the PR head, so it fast-forwards after the merge. Squash makes local `main` diverge. |
| D-3 | Add a Postgres service to CI so the Supabase suites run for everyone. | Đăng | Thu 12 Nov | Yes, but it needs a separate test database, not the shared dev one. Until then, a second person reproduces the local suites. |
| D-4 | Team-owned AI provider account with a hard monthly cap. Who owns it, what cap. | Team | Fri 13 Nov | One account, one owner (Bảo), cap set before any adapter runs on real footage. |
| D-5 | Hosting plan: web host, Docker worker host with FFmpeg, paid Supabase tier from 1 Dec. | Team | Fri 20 Nov | Decide by 20 Nov so deploy is rehearsed before 30 Nov. |
| D-6 | Two entries: can one person submit both DEAD AIR and SLEUTH? Read the official rules. | Đăng | Wed 11 Nov | Check now. If no, choose one before the week ends. |
| D-7 | Eligibility answers from each member: student status, Kiroween 2025, age of majority. | Each member | Wed 11 Nov | Each posts one line. Do not guess for anyone. |
| D-8 | Who adds the hourly purge call to `apps/worker` (ADR 0008). | Bảo | Fri 20 Nov | Bảo, after ea 1-4. Low priority. |
| D-9 | Name the daily-update channel for the async post (done, contract changes, blocked, next PR). | Team | Mon 9 Nov | Any one channel. Name it in the brief. |
