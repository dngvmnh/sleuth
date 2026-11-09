# Ingestion: design

## Where things are today

- Contracts: `packages/contracts/src/endpoints.ts` already defines all ingestion endpoints and bodies.
- Rules: `segmentScript`, `diffScriptVersions`, `invalidateForNewAssetVersion` in `packages/domain`.
- Storage interface: `ProjectStore` in `packages/db/src/store.ts`. `createFixtureStore()` implements it in memory.
- Routes: `apps/web/app/api/v1/**/route.ts` use `endpoint()` from `apps/web/app/api/_lib/api.ts`, which picks the store through `getStore()` in `_lib/data-source.ts`. Supabase mode answers 501 today.
- Schema and RLS: `packages/db/src/schema.ts`, migration in `packages/db/migrations/`. Never run against a database yet.
- Queue: `apps/worker/src/pg-queue.ts` (claim with `SKIP LOCKED`). Never run against a database yet.

## Approach

Add a second `ProjectStore` implementation on Drizzle, and prove both behave the same with one shared test suite.

```
route -> endpoint() -> getStore() -> ProjectStore
                                      |-- fixture store (memory)
                                      `-- supabase store (Drizzle + Supabase Storage)
```

### Shared store contract tests

`packages/db/src/store-contract.ts` exports `runStoreContract(name, makeStore)`, a Vitest suite covering requirements 1 to 4. `fixture/store.test.ts` calls it with the fixture store. `supabase/store.test.ts` calls it with the Supabase store and is skipped unless `TEST_DATABASE_URL` is set. A change that passes only one of them is a bug in one of them.

### Actor and auth

`resolveActor(req)` in `_lib/data-source.ts` returns `{ userId }`.

- Fixture mode: `x-fixture-user` header (exists today).
- Supabase mode: read the Supabase session from cookies with `@supabase/ssr`, verify it server side with `auth.getUser()`, and return the user id. Never trust a client-sent id.
- The browser calls `supabase.auth.signInAnonymously()` when the visitor clicks "try your own video". Anonymous sign-in must be enabled in the Supabase dashboard (a manual setup step, listed in `docs/team-plan.md`).

### Supabase store

- Uses a Drizzle connection with the service role for server work, and checks access in code with the same rules as RLS (`canRead`, `canWrite`). RLS stays on as a second layer and is tested with a user-scoped connection (task 9).
- Writes that span tables (new script version plus segments, checklist replace, upload plus asset row) run in one transaction.
- Retired segment ids come from `select id from script_segments where project_id = $1` so ids are never reused (3.2).
- Idempotent analysis (4.3): a partial unique index on `processing_jobs` for `(project_id, payload->>'assetVersionId', payload->>'scriptVersionId')` where `status in ('queued','running')`; the insert uses `on conflict do nothing` then selects the existing row. This is a schema change, so it needs a `contract-change`-style review (migration only, no contract change).

### Upload URLs

`createUploadUrl` inserts the `AssetVersion`, then calls Supabase Storage `createSignedUploadUrl(path)` on the private `video-assets` bucket with the service role on the server. Path: `<projectId>/<version>/<random>.<ext>`; the original file name is not stored in the path (no user content in logs or paths). The URL's own token lives about 2 hours (measured 7199 s) and Storage has no setting to shorten it. So `expiresAt` in the response is the end of a 5-minute upload window (`UPLOAD_WINDOW_MS`), and `startAnalysis` asks Storage when the file landed (`StorageClient.uploadedAt`): no file is 409 `upload_missing`, a file that landed after the window is 409 `upload_late`. Both clocks are server clocks (app server and the Supabase database), not the browser's.

### Limits

A pure function in `packages/domain/src/limits.ts`:

```ts
checkLimits({ durationMs, analysesToday, config }): { ok: true } | { ok: false; code: "video_too_long" | "limit_exceeded"; resetsAt?: string }
```

Domain stays free of clocks: the caller passes `analysesToday` and `now`. The store counts today's analyses with `select count(*) from audit_events where actor_id = $1 and type = 'analysis_requested' and created_at >= date_trunc('day', now() at time zone 'utc')`. The check and the insert happen in one transaction with an advisory lock on the user id so two parallel requests cannot both pass at count 4.

`StoreError` gains status 429. This touches the `StoreError` type and the error table in `docs/api/openapi.yaml` (contract-change PR).

### Retention

`purgeExpiredAnonymousProjects(now, days)` in the store deletes projects whose owner is an anonymous user and whose `created_at` is older than the cutoff, and removes their storage objects. Called from a scheduled job (Supabase cron or a worker timer, decided in task 10). Cascade deletes rows; the storage listing and delete run first.

### Audit events

Types: `project_created`, `asset_version_created`, `script_version_created`, `checklist_replaced`, `analysis_requested`. `data` holds ids and counts only.

## Error handling

All failures become `StoreError(code, status, message)` and then the standard error body. Database errors are caught in the store and mapped to `internal_error` with no SQL in the message. Unique-violation on the active-job index is not an error (4.3).

## Testing

- Unit: limits, with property tests for 5.2.
- Shared store contract suite on both stores.
- Route tests in `apps/web/app/api/_lib/api.test.ts` style, calling handlers directly.
- Real Postgres checks (4.5, RLS): run only when `TEST_DATABASE_URL` is set. CI does not have a database in Phase 2; add a Postgres service container to CI as part of task 9 if the team agrees.

## Open questions

- Anonymous retention period (7 days assumed).
- Whether CI gets a Postgres service container (recommended, small).
- Exact Storage signed-upload-URL lifetime; confirm in the Supabase docs when implementing task 6.
