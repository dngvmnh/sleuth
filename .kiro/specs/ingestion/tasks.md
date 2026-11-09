# Ingestion: tasks

All tasks are Đăng's (@dngvmnh), each half a day or less. Tasks 1 to 4 run fully against fixtures. Tasks 5 to 10 need a Supabase dev project (or local Postgres) and are marked. After every task fixture mode must still work with no keys: run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts`.

- [x] 1. Pure limits function
  - Owner: Đăng
  - Files: `packages/domain/src/limits.ts`, `packages/domain/src/limits.test.ts`, `packages/domain/src/limits.property.test.ts`, `packages/domain/src/index.ts`
  - Do: `checkLimits({ durationMs, analysesToday, config })` with codes `video_too_long` and `limit_exceeded`. Config has `maxVideoMs`, `dailyAnalysisLimit`.
  - Done when: unit tests cover edges (0, 180000, 180001, count at limit); property tests prove 2.2 and 5.2's pure part.
  - Requirements: 2.2, 5.2, 5.3

- [x] 2. Shared store contract suite
  - Owner: Đăng
  - Files: `packages/db/src/store-contract.ts`, `packages/db/src/fixture/store.test.ts`
  - Do: move the access, review and change tests into `runStoreContract(name, makeStore)`; add cases for 1.3 (property), 2.3, 3.2, 3.4, 4.2, 4.3. Fixture store calls it.
  - Done when: the suite passes on the fixture store; the cases that fail (4.3 duplicate jobs, 3.2 retired ids if missing) are fixed in the fixture store in this task.
  - Requirements: 1.3, 2.3, 3.2, 3.4, 4.2, 4.3

- [x] 3. Enforce limits in the fixture store
  - Owner: Đăng
  - Files: `packages/db/src/store.ts` (add status 429), `packages/db/src/fixture/store.ts`, `packages/db/src/fixture/store.test.ts`, `docs/api/openapi.yaml` (regenerated)
  - Do: count `analysis_requested` per user per UTC day with the injected clock; return 429 `limit_exceeded` with `details.resetsAt`. Add `analysis_requested` audit events to the fixture store.
  - Done when: a sixth analysis in a day is refused, the next UTC day is accepted, `pnpm check:contracts` passes. Label the PR `contract-change` (new error status).
  - Requirements: 5.2, 6.1

- [x] 4. Audit events in the fixture store
  - Owner: Đăng
  - Files: `packages/db/src/fixture/store.ts`, `packages/db/src/fixture/store.test.ts`
  - Do: write `AuditEvent` rows for project, asset, script, checklist creation; ids only. Add a test that scans every event's JSON for script text and file names.
  - Done when: the test finds no content in any event.
  - Requirements: 6.1

- [x] 5. Supabase store, read side (needs database)
  - Owner: Đăng
  - Files: `packages/db/src/supabase/store.ts`, `packages/db/src/supabase/store.test.ts`, `packages/db/package.json`
  - Do: implement `listProjects`, `getProjectDetail`, `listEvidence`, `listFindings`, `getJob`, `getReportData` with Drizzle and the access rules. Run `pnpm db:generate` check (no schema drift), apply the migration to the dev project, run `pnpm db:seed`.
  - Done when: the contract suite's read cases pass with `TEST_DATABASE_URL` set; the demo project is readable with no user. Record in the journal that the migration was applied for the first time.
  - Requirements: 1.3, 1.4, 1.6

- [x] 6. Supabase store, write side (needs database)
  - Owner: Đăng
  - Files: `packages/db/src/supabase/store.ts`, `packages/db/migrations/` (new migration for the active-job unique index), `packages/db/src/schema.ts`
  - Do: `createProject`, `createScript` (transaction, retired ids from the table), `setChecklist` (transaction), `startAnalysis` (idempotent insert, limit check with advisory lock), `createReshoot`, `reviewEvidence` (via `applyReviewDecision`).
  - Done when: the full contract suite passes on the Supabase store.
  - Requirements: 1.1, 1.2, 1.5, 3.1 to 3.5, 4.1 to 4.3, 5.2

- [x] 7. Signed upload URLs (needs Supabase project)
  - Owner: Đăng
  - Files: `packages/db/src/supabase/storage.ts`, `packages/db/src/supabase/store.ts`, `.env.example` (check only; no values)
  - Do: private `video-assets` bucket; `createSignedUploadUrl`; path without file name; `expiresAt` at most 5 minutes; invalidate evidence on older asset versions in the same transaction.
  - Done when: a real upload to the signed URL works from a script; a URL older than its expiry is refused; the response never contains the service-role key (test on the JSON).
  - Status: done with decision D-1 (option 3): the 5-minute window is enforced at analysis time, because Supabase signed upload URLs live 2 hours.
  - Requirements: 2.1, 2.4, 2.5

- [x] 8. Session actor and anonymous sign-in (needs Supabase project)
  - Owner: Đăng
  - Files: `apps/web/app/api/_lib/data-source.ts`, `apps/web/app/api/_lib/supabase-server.ts`, `apps/web/app/api/_lib/api.test.ts`, `apps/web/package.json`
  - Do: add `@supabase/supabase-js` and `@supabase/ssr` (exact versions); in supabase mode `getStore()` returns the Supabase store and `resolveActor` verifies the session with `auth.getUser()`. Tell Đạt in the PR which environment variable names the browser needs; Đạt adds the browser-side `signInAnonymously()` call in `apps/web/lib` as part of review-workspace task 3.
  - Done when: with a fake verifier injected, routes accept a valid actor and refuse a forged id; a manual run with a token from the Supabase dashboard shows an anonymous user can create a project and cannot read another's.
  - Requirements: 1.1, 1.2, 5.1

- [x] 9. RLS checks on a real Postgres
  - Owner: Đăng
  - Files: `packages/db/src/supabase/rls.test.ts`, `.github/workflows/ci.yml` (optional Postgres service)
  - Do: with two database roles that set `request.jwt.claims`, prove user A cannot read or write user B's rows, anon can read only the demo, and anon cannot write. Skip when `TEST_DATABASE_URL` is unset. The two-worker queue check (requirement 4.5) is evidence-analysis task 16, owned by Bảo because it lives in `apps/worker`.
  - Done when: the test passes locally; results recorded in the journal; CI service added only if the team agrees (shared file, needs all reviewers).
  - Requirements: 1.4

- [x] 10. Retention purge
  - Owner: Đăng
  - Files: `packages/db/src/fixture/store.ts`, `packages/db/src/supabase/store.ts`, `packages/db/src/store.ts`, tests
  - Do: `purgeExpiredAnonymousProjects(now, days)` on both stores; storage objects removed first. Decide the scheduler (Supabase cron or worker timer) and write it in an ADR (`docs/decisions/0008-anonymous-retention-purge.md`; 0007 is kept for the provider choice).
  - Done when: the fixture-store test passes with an injected clock; a manual run on the dev project removes an old anonymous project and its files.
  - Status: purge on both stores (tests on each); the worker calls it hourly (`apps/worker/src/retention.ts`, PR reviewed by the worker owner).
  - Requirements: 5.4
