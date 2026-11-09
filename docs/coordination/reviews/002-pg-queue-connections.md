# Review note: pg-queue test and connection limits (10 November 2026)

Reviewer: Đăng. Area: `apps/worker/src/pg-queue.test.ts` (evidence-analysis 16, owner Bảo).

Not a PR review: no PR was open. The change went straight to `main`.

- Finding: the suite opened two connections per queue and closed them only after all 13 tests. Against the Supabase Free session pooler (15 clients) it failed with `EMAXCONNSESSION`. CI uses a local database with no such cap, so CI stayed green.
- Change: `afterEach` closes the queues of each test.
- Result: 13 of 13 pass against the hosted pooler, and the full suite passes (532 tests).
- Contract change: none. Shared files: none.
- Ask: when a test file makes connections, close them in `afterEach`, because the hosted pooler has a small cap.