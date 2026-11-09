# Kiro engineering journal

Judges read this. Keep entries dated and honest: what Kiro did, what we corrected, what failed.

## Entry template

```
### YYYY-MM-DD, <name>, <area>
- Goal:
- Kiro feature used (steering / spec / hook / agent / MCP / chat):
- What Kiro produced:
- What we had to fix or reject:
- Result (tests run, real output):
```

## Entries

### 2026-11-08, scaffold owner, bootstrap Phase 1
- Goal: set up Kiro steering and decision records before writing code.
- Kiro feature used: chat in an empty clone of `dngvmnh/sleuth`, driven by a written bootstrap prompt.
- What Kiro produced: eight steering files in `.kiro/steering/`, six ADRs in `docs/decisions/`, and this journal.
- What we had to fix or reject: nothing yet; the owner has not reviewed it. The `frontend.md` rule lists UI folders instead of excluding `apps/web/app/api/**`, because we could not confirm that fileMatch supports exclusion patterns.
- Result: files written. No code and no tests exist yet, so nothing has been run.

### 2026-11-08, Đăng (@dngvmnh), Phase 1 review and corrections
- Goal: apply review notes to the Phase 1 output before building the scaffold.
- Kiro feature used: chat; steering files edited in place.
- What changed: `frontend.md` now matches `apps/web/**` (API routes also load `backend.md`; the two do not conflict). ADR 0004 now defines normalisation with the token regex `[\p{L}\p{N}]+(?:[.,:'-][\p{L}\p{N}]+)*` instead of stripping all punctuation, so "3.5" and "35" hash differently while "Click Export." and "click export" hash the same. Ownership now names Đạt (@phatdat220707), Đăng (@dngvmnh) and Phạm Quốc Bảo (@baofrovn). `TEAM-PLAN.md` moved to `docs/team-plan.md` (it was untracked, so a plain move). `.vscode/settings.json` sets the Windows terminal profile to PowerShell.
- What failed: `corepack enable` failed with EPERM because Node is installed under nvm for Windows (`C:\Users\...\nvm\v22.17.1`). Used `npm install -g pnpm@10.12.1` instead and pinned `packageManager` in the root `package.json`.
- Result: no code yet. Nothing to run.

### 2026-11-08, Đăng (@dngvmnh), Phase 2 foundation scaffold
- Goal: monorepo that runs in fixture mode with no setup, so three people can work in parallel.
- Kiro features used: chat in agent mode, always-on steering (product, architecture, coding standards, team workflow), and the golden fixture as a shared contract.
- Built: `packages/contracts` (all entities, 14 endpoint schemas, fixture schema, finding labels), `packages/domain` (segmenting with stable ids, normalised hashing, diff, two invalidation functions, review state machine, Poltergeist findings), `packages/db` (Drizzle schema with RLS policies and check constraints, first migration, seed mapping, in-memory fixture store), `packages/media` (two provider interfaces, mocks, output validation), `packages/evidence-engine` (word-overlap matching, confidence, explanations, outside-proof detection, idempotent merge, frame planning), `apps/worker` (claim, heartbeat, retry; Postgres queue and fixture queue; Dockerfile with FFmpeg), `apps/web` (design tokens, 14 route handlers, typed API client, one page), OpenAPI generated from Zod, CI, PR template, CODEOWNERS.
- Golden fixture: `fixtures/golden/build.ts` defines inputs and runs the engine; `generate.ts` writes the JSON. I read the generated expected output by hand against the inputs (4 evidence candidates, 4 findings: one of each kind except Poltergeist) and it matched what I predicted before running. The expected output is regression-locked, not independently labelled; the `evidence-analysis` spec adds hand-labelled clips.
- What failed and how it was fixed:
  - `pnpm add typescript` pulled TypeScript 7, which typescript-eslint does not support yet. Pinned `typescript@5.9.3`.
  - A removed segment's id could be reused by a later new segment, because only the latest version was consulted. Added a `retiredIds` option to `segmentScript` and a test.
  - Lint flagged a useless escape in the token regex (`\-`). Moved the hyphen to the end of the class.
  - Dev API helpers first lived in `apps/web/lib`, which is frontend territory. Moved them to `apps/web/app/api/_lib` (backend territory).
  - The first attempt to start the worker as a background job produced no output; a synchronous `--once` run and a timed run showed it working.
- Real command results (PowerShell, Windows, Node 22.17.1, pnpm 10.12.1): `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test` 11 files / 102 tests passed; `pnpm test:property` 2 files / 13 tests passed; `pnpm check:contracts` 11 tests passed and `openapi.yaml` matches; `pnpm build` compiled all 14 routes; `pnpm test:e2e` 3 Playwright tests passed on Chromium. `pnpm dev` served `/api/v1/projects`, the CSV report, and refused a write to the demo with 403 `demo_read_only`. `pnpm worker` claimed `job-demo-1`, succeeded, then idled; it stayed alive for 8 seconds until stopped.
- Not verified: Docker is installed but the daemon was not running, so the Postgres migration, the RLS policies, the `FOR UPDATE SKIP LOCKED` claim query and the worker Dockerfile were never executed. The migration was generated by `drizzle-kit` and read, not applied. Supabase mode is not wired into the web app (routes answer 501) and the worker's supabase handler fails loudly. Fixture jobs stay `queued` in the web store; only the worker command processes the fixture job.
- Open decisions: the fixture has no video file, so the player has nothing to play until a team member adds their own footage.

### 2026-11-08, Đăng (@dngvmnh), Phase 3 Kiro automation
- Goal: hooks, custom agents and MCP suggestions that fit the installed Kiro.
- Installed versions found on this machine: Kiro IDE 1.1.787 and Kiro CLI 3.1.0. Both are 1.x / V3, so the old `.kiro.hook` format and "manual hooks" no longer apply.
- How I checked formats: the bundled `hook.json` schema in the IDE is the old 0.x schema, so I did not use it. Kiro's docs pages did not load as text, so I used public sources: the IDE 1.0 changelog on kiro.dev (hooks are v1 JSON in `.kiro/hooks/`, manual hooks replaced by manual steering files, agents are Markdown files) and a third-party write-up of the hook docs (trigger names, `matcher`, `action.type` of `command` or `agent`, exit codes, `timeout`). I could not open the IDE from this session, so no hook has fired inside Kiro and no agent has been selected in the picker yet.
- Built:
  - `.kiro/hooks/package-tests-on-save.json`, `contracts-on-save.json`, `after-spec-task.json` (command hook for typecheck and tests of changed packages, agent hook for the journal entry). All commands call `tools/kiro-hooks/hook.mjs`, plain Node, so they behave the same in PowerShell.
  - Hook 4 "Ghost hunt" is a manual steering file, `.kiro/steering/ghost-hunt.md` (`/ghost-hunt`), because Kiro 1.x cannot create manual hooks. A deterministic `ghost-scan` step supports it.
  - `.kiro/agents/`: `frontend-builder`, `backend-builder`, `media-builder`, `qa-reviewer`. Builders get write allow rules for their own folders and deny rules for the other areas; `qa-reviewer` has no write tool and a deny rule on all writes.
  - `.kiro/settings/mcp.json`: Supabase (read-only, version pinned), Playwright, GitHub. All disabled, placeholders only.
  - `tests/kiro-config/kiro-config.test.ts` validates all of the above against the format we built for.
- Limits worth knowing: file-save hooks fire for the agent's changes, not for typing in the editor (per the docs summary), so CI stays the backstop. Permission rule syntax (`capability`, `match`, `effect`) is taken from public examples and not tested in the IDE. `${GITHUB_PERSONAL_ACCESS_TOKEN}` expansion in MCP `headers` is reported to differ between Kiro versions.
- Real results: ran each hook command by hand. `test domain` 2 s, `test evidence-engine` 2 s, `contracts` 20 s, `task-check` and `ghost-scan` under 1 s. A deliberately failing test made `test domain` exit 1 with the failure on stderr; I then deleted that test. Gate: `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` 12 files / 117 tests passed, `pnpm test:property` 13 passed, `pnpm check:contracts` passed, `pnpm build` passed.
- What went wrong: a PowerShell string edit left literal backtick-n text in `hook.mjs`; lint caught it and I fixed it with a normal edit.

### 2026-11-08, Đăng (@dngvmnh), Phase 4 feature specs
- Goal: five specs the team can start on 10 November without waiting on each other, and one team plan.
- Kiro features used: spec files (`requirements.md`, `design.md`, `tasks.md`), written against the code that exists after Phase 2 so every design names real files and functions.
- Built: `.kiro/specs/ingestion` (10 tasks, Đăng), `evidence-analysis` (16 tasks: 13 Bảo, 1 Đạt, 1 Đăng for recording clips, plus the queue test), `change-impact` (10 tasks, one for Bảo), `review-workspace` (14 tasks, Đạt), `final-seal` (10 tasks: 5 Đăng for contracts, rules, store and report, 5 Đạt for the UI). Each criterion is EARS-style; criteria that need a property test are tagged `[PBT]`. `docs/team-plan.md` now holds setup commands for a fresh Windows clone, three days of tasks per developer, the first pull requests, and ten risks.
- A check that found real problems: `tests/kiro-config/specs.test.ts` parses every `tasks.md` and fails if a task lacks an owner, files or a done condition, cites a requirement that does not exist, or lists a file its owner may not edit. It caught two ownership mistakes in my own draft: an ingestion task asked Đăng to edit a frontend folder and another to edit a worker test. I moved the browser sign-in call to Đạt's task and the queue test to a new Bảo task (evidence-analysis 16). It also caught abbreviated paths and a missing folder prefix.
- Real results: `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test` 13 files / 144 tests passed; `pnpm test:property` 13 passed; `pnpm check:contracts` passed; `pnpm build` passed.
- Not verified: the specs describe work that does not exist yet. The Supabase parts (ingestion 5 to 9, evidence-analysis 12 and 16) have never run against a database.
- Decisions left open on purpose (each is written in the relevant `design.md`): provider choice (ADR 0007, Bảo), retention period and scheduler (ingestion 10), whether unscripted and reordered lines need their own finding types, whether CI gets a Postgres service.

### 2026-11-08, Đăng (@dngvmnh), ingestion 1 to 4 and change-impact 1 and 2
- Goal: finish Đăng's first-day tasks. `deriveSegmentStates` is on the critical path because Đạt's timeline (review-workspace 7) uses it.
- Kiro feature used: the specs in `.kiro/specs/ingestion` and `.kiro/specs/change-impact`, one task at a time, tests first for the rules.
- Built:
  - `packages/domain/src/segment-state.ts`: five states, first-match rules. A candidate whose `segmentHash` no longer matches counts as stale even if its status was not updated.
  - `packages/domain/src/reanalysis.ts`: `planReanalysis(diff, evidence, { assetChanged })`.
  - `packages/domain/src/limits.ts`: `checkLimits` plus UTC-day helpers. Added an `invalid_duration` code beside the two in the spec, so a negative or fractional duration is not called "too long".
  - `packages/db/src/store-contract.ts`: one suite for project isolation, contiguous asset versions, retired segment ids, checklist positions, and jobs. `fixture/store.test.ts` runs it. Other stores will run the same suite.
  - Fixture store: daily limit (429 `limit_exceeded` with `details.resetsAt`, default 5, from `DAILY_ANALYSIS_LIMIT_PER_USER`), duration check at the store, idempotent analysis requests, and audit events with ids and counts only. `ProjectStore` gained `listAuditEvents` (owner only). OpenAPI lists the 429 response.
- Decisions to check:
  - A repeat request returns the existing queued or running job and does not use up the daily quota. "Same request" means same video version, script version and set of segments, so a re-analysis of other segments is a new job.
  - Stale plus rejected evidence shows as `uncovered`, not `stale`: a person already said no, so nothing is left to review.
- What the tests caught: I removed `retiredIds` from the fixture store on purpose and the segment-id property test failed in 1 run, so the contract suite does detect id reuse. The file is restored.
- Real results: `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test` 16 files / 211 tests passed; `pnpm test:property` 29 passed; `pnpm check:contracts` passed; `pnpm build` passed. `e2e` not re-run (no UI change).
- Contract change: new error status 429 and the `listAuditEvents` store method. The PR needs the `contract-change` label.
- Not done: nothing here touches Supabase. The contract suite has not run against a real store other than the fixture.

### 2026-11-08, Đăng (@dngvmnh), milestones 1 and 2: change-impact and Final Seal backend (fixture mode)
- Goal: finish the rest of Đăng's change-impact and final-seal tasks that run without a database.
- Kiro feature used: `backend-builder` agent rules and the specs. Tests were written before or with each rule, and one property test found two real bugs.
- Built (change-impact 3, 5, 6, 7, 8, 10):
  - `resolvePoltergeists`; Poltergeist findings now say whether the script or the video made them stale.
  - `reanalysisPlan` on the script response; `startAnalysis` rejects empty or unknown `segmentIds` (400); `applyAnalysisResult` and `breakSeal` on a `FixtureStore` type (not part of the shared `ProjectStore` contract); `script_revised` and `asset_replaced` audit events with counts only.
  - `packages/db/src/fixture/store.property.test.ts`: 200 random histories of edits, cosmetic edits, removals, uploads, re-analyses and reviews; invariants checked after every step. `apps/web/app/api/_lib/change-impact.test.ts`: copy the demo, edit one sentence, see 1 stale candidate and 1 Poltergeist, re-analyse that line with the real matching engine, see it resolved.
- Built (final-seal 1 to 5): contracts (`CoverageSummary`, `CoverageState`, `Seal`, `SealBlocker`, four endpoints and OpenAPI), `computeCoverage`, `sealBlockers`, `canSeal`, store methods `getCoverage`, `listReshoots`, `updateReshoot`, `sealProject` and seal breaking on edits and uploads, the four routes (first as 501 stubs, then wired), and a `ReportModel` behind both exports (sections, banner for draft, sealed or broken, formula neutralising, escaped HTML with print CSS).
- Bugs the property test found, both in code I wrote earlier:
  1. A stale candidate that a person dismissed (`rejected`) could then be confirmed, because the review rules only looked at the status. `applyReviewDecision` now takes the current line hash and video id and refuses anything but a dismissal for outdated evidence. Mutation check: with the new argument removed the property test failed in 4 of 6 runs.
  2. A dismissed candidate turned back into `stale` on every later script change, which reopened its Poltergeist and broke "a cosmetic edit changes nothing". `rejected` now stays `rejected`.
  A third small one: evidence going stale a second time did not reopen its resolved Poltergeist. Fixed by upserting findings.
- Decisions to check: `computeCoverage` takes `(checklist, script, evidence, decisions, reshoots?)`, the optional fifth argument is how open reshoots count. A `confirmed` status without a person's confirm decision is never "proven". An empty checklist cannot be sealed (reported as `uncovered_items`). Sealing with open reshoots and outside-proof items is allowed and shown. Re-sealing replaces the earlier seal and keeps it as `broken` with reason "Replaced by a newer seal." `mergeEvidence` and `mergeFindings` moved to `@sleuth/domain` (evidence-engine re-exports them) so stores can use them without breaking the dependency direction.
- Real results (PowerShell): `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test` 22 files / 289 tests passed; `pnpm test:property` 9 files / 54 passed; `pnpm check:contracts` 14 tests passed and `openapi.yaml` matches; `pnpm build` passed; `node tools/kiro-hooks/hook.mjs ghost-scan` found nothing new, and a separate scan of all non-test source shows `confirmed` is only assigned in `packages/domain/src/review.ts`. Note that `ghost-scan` reads `git diff HEAD`, so it cannot see untracked new files; I ran the manual scan for that reason.
- Contract changes (need the `contract-change` label): four endpoints, `reanalysisPlan`, new schemas, new error status 429 (earlier), `ReportData` fields, `listAuditEvents`, `listReshoots`, `updateReshoot`, `getCoverage`, `sealProject` on `ProjectStore`.
- Not done: milestone 3 (Supabase store, storage, auth, RLS tests, retention). No `DATABASE_URL`, `TEST_DATABASE_URL`, Supabase credentials or `.env` file exist on this machine and Docker's daemon is off, so none of it could run. I did not write unrun database code and call it done.

### 2026-11-08, Đăng (@dngvmnh), milestone 3: ingestion 5 to 10 on the real Supabase dev project
- Goal: the Supabase store, storage, session auth, RLS proof and retention, all run against `sleuth-dev` (ap-northeast-2, session pooler, `prepare: false`).
- Kiro feature used: `backend-builder` agent rules and the ingestion spec. The shared `runStoreContract` suite from task 2 now runs against both stores.
- Migration: `0000_exotic_devos.sql` was first applied by the team through drizzle's migrator. I added `pnpm db:migrate` (`packages/db/src/migrate.ts`, reads the root `.env.local`) and applied `0001_hard_colonel_america.sql` with it, so `drizzle.__drizzle_migrations` now holds 2 rows. 0001 adds the `seals` table (RLS on, one active seal per project via a partial unique index), the `processing_jobs.request_key` column, and the partial unique index `jobs_one_active_per_request (project_id, request_key) where status in ('queued','running')`.
- Built:
  - `packages/db/src/supabase/store.ts`: `createSupabaseStore({ db, storage?, now?, dailyAnalysisLimit?, maxVideoMs? })`. All `ProjectStore` methods, not only the six in the task, so supabase mode serves every route. Writes run in transactions that lock the project row; `startAnalysis` takes `pg_advisory_xact_lock(hashtext(userId))`, then inserts with `on conflict do nothing` and returns the existing job.
  - `storage.ts`: service-role storage client, private `video-assets`; path `<project>/<version>/<uuid>.<ext>`, never the file name.
  - `apps/web/app/api/_lib/supabase-server.ts` and `data-source.ts`: in supabase mode `resolveActor` asks Supabase Auth via `auth.getUser()` (cookies from `@supabase/ssr`, or a Bearer token); `x-fixture-user` is ignored. `next.config.ts` loads the root `.env.local`.
  - `purgeExpiredAnonymousProjects(now, days)` on both stores, on a separate `RetentionStore` interface; ADR 0008 (worker timer, hourly, 7 days).
- Test data on a shared database: dev and test are one database, so test owners are UUID v5 ids from fixed namespaces, project names start with `contract-test-`, each file deletes its own rows before and after, RLS checks roll back, and the purge test works in the year 2000 so it cannot reach real rows. A probe after the full run found 0 test projects, the demo's 4 evidence rows intact, 0 anonymous users and 0 stored files.
- Decisions to check:
  - Identical requests share one job through `request_key` (`<asset>|<script>|<sorted segment ids or "full">`) and not through the jsonb expressions in the request: a plain column makes the index exact for segment sets in any order.
  - The server connects as `postgres` (bypasses RLS), so the store enforces access itself and RLS is the second wall. A non-UUID actor id can never own anything.
  - Supabase mode `createProject({ copyFromDemo: true })` copies the golden fixture under new ids, like the fixture store.
  - The ADR is numbered 0008 as asked; 0007 is still reserved for the provider choice.
- Real results on Postgres (PowerShell): `store.test.ts` 29 tests (read side plus the full contract suite, property runs capped at 4 because each run is many remote round trips), `store.write.test.ts` 9 (index present, 6 concurrent identical requests give 1 job and 1 audit event, 4 parallel projects under a limit of 2 give exactly 2 jobs and two 429s, review, reshoots, seal blockers), `store.upload.test.ts` 5 (real upload to the signed URL, tampered token refused, private bucket refuses anon download, no key or file name in the response, older evidence stale at once), `api.supabase.test.ts` 5 (real anonymous sign-in creates a project and gets 404 on another user's), `rls.test.ts` 10, `store.purge.test.ts` 2. A built `next start` in supabase mode answered `GET /api/v1/projects` with only the demo and `POST` with 401 for a forged header.
- Gate after step 5: `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test` 28 files / 352 passed, 1 todo; `pnpm test:property` 9 files / 54 passed; `pnpm check:contracts` 14 passed, OpenAPI matches; `ghost-scan` clean; `pnpm --filter @sleuth/web build` passed.
- Not done:
  - Task 7 stays unticked. Supabase signed upload URLs live 2 hours (measured 7199 s) and the SDK has no setting for it, so requirement 2.4's five-minute limit is not met. `expiresAt` reports the real expiry from the token, not a made-up five minutes. Options: accept 2 hours, upload through our own short-lived endpoint, or refuse at analysis time files that landed more than five minutes after the URL was made. Needs a team decision.
  - The hourly purge call in `apps/worker` is Bảo's to add (ADR 0008). The worker's Postgres queue is still unrun (evidence-analysis 16).
  - CI has no Postgres service, so these suites skip in CI.

### 2026-11-09, Đăng (@dngvmnh), `Project.updatedAt` for review-workspace 1.2
- Asked by Đạt: requirement 1.2 lists "last change", newest first, but `Project` had only `createdAt`. I kept the requirement and added the field instead of renaming the column to "Created".
- Built: `updatedAt` on `ProjectSchema` (required) and the golden fixture; `projects.updated_at` column in migration `0002_fancy_dracula.sql`, which backfills `updated_at = created_at`, applied with `pnpm db:migrate` (3 migrations recorded). Both stores move it on every audited write plus reviews, reshoots and (fixture) finished analyses. A refused write does not move it. `listProjects` returns the demo first, then newest change first. Copies of the demo now get their own `createdAt` in the fixture store too.
- Test: a new contract case runs on both stores (order after creation, after a checklist change, and after a refused upload).
- Real results: `pnpm lint` and `pnpm typecheck` clean; `pnpm test` 28 files / 354 passed, 1 todo (Postgres suites on sleuth-dev); `pnpm test:property` 54 passed; `pnpm check:contracts` 14 passed, OpenAPI regenerated and matching; `ghost-scan` clean.
- Not done: the worker's Postgres path (`apps/worker`, Bảo) does not move `updated_at` when an analysis finishes. Contract change: needs the `contract-change` label.

### 2026-11-09, Đăng (@dngvmnh), CI database job (decision D-3)
- Goal: make ingestion 5, 6, 8, 9 and 10 provable by anyone, not only on my machine.
- Built: a `db` job in `.github/workflows/ci.yml`. It starts a throwaway local Supabase stack with the CLI (3.0.0; Postgres 17 like the hosted project, Auth with anonymous sign-in, Storage with the private `video-assets` bucket from `supabase/config.toml`), applies migrations with `pnpm db:migrate`, seeds the demo, then runs `packages/db/src/supabase` and the Supabase-mode API test. It never touches the shared dev project. `SLEUTH_REQUIRE_DB=1` makes a missing setting an error, so the job cannot go green by skipping.
- First run failed in `supabase/setup-cli` with HTTP 504 while downloading the CLI. A re-run passed, so it was the download, not our code.
- Real result (run 42578866891): 6 files, 61 passed, 1 todo, 0 skipped. The `check` job stayed green.
- Not verified: how often the CLI download flakes. If it keeps failing, cache the binary.

### 2026-11-09, Đăng (@dngvmnh), change-impact 9: revisions on the Supabase store
- The revision and upload paths already ran in one transaction each (ingestion 6, 7). This task proves it with the same random-history property test the fixture store passes.
- Built: `packages/db/src/change-impact-contract.ts` (`runChangeImpactContract`), moved out of the fixture-only property test. `applyAnalysisResult` now lives on the Supabase store too (shared `AnalysisWriter` type), in one transaction, writing only rows that changed. This is also the write path the worker's Supabase handler (evidence-analysis 12, Phạm Quốc Bảo) can call.
- Mutation check: with `resolvePoltergeists` removed from the Supabase write path, the 6 random histories still passed. I added a direct check to the deterministic case (the Poltergeist must be resolved after re-analysis); the mutant then failed with `expected 'open' to be 'resolved'`. Restored.
- Real results: Supabase change-impact suite 2 passed on sleuth-dev (6 histories, up to 8 steps, 107 s); fixture 200 histories passed. Gate: lint and typecheck clean; `pnpm test` 29 files / 356 passed, 1 todo; `pnpm test:property` 54 passed; `pnpm check:contracts` 14 passed; build passed; ghost-scan clean.
- Not verified in CI: the Postgres suites still skip there (next task).

### 2026-11-09, Đăng (@dngvmnh), ingestion 7: five-minute upload window (decision D-1, option 3)
- Supabase signed upload URLs live 2 hours and cannot be shortened. The store now enforces the 5-minute rule itself: `expiresAt` is the end of a 5-minute window (`UPLOAD_WINDOW_MS`), and `startAnalysis` asks Storage when the file landed (`StorageClient.uploadedAt`). No file: 409 `upload_missing`. A file that landed after the window: 409 `upload_late`. Requirement 2.1 and the design say so now.
- Tests on sleuth-dev with real uploads: inside the window is queued; no upload is refused; a URL made "ten minutes ago" by the store's clock with the file landing now is refused as late. 8 upload tests passed; the earlier todo is gone.
- Gate: lint and typecheck clean; `pnpm test` 28 files / 357 passed; property 54; contracts 14; build passed; ghost-scan clean.
- For Đạt: the upload flow (review-workspace 12) should show both new 409 codes. No schema change.
- Not verified: browser-to-server clock skew does not matter (both times are server times), but app-server versus database skew is assumed to be under a few seconds.

### 2026-11-09, Đăng (@dngvmnh), ingestion 10: the worker now runs the purge
- `apps/worker/src/retention.ts`: `startRetentionTimer` runs `purgeExpiredAnonymousProjects` at start and every `RETENTION_INTERVAL_MS` (default 1 hour), period `ANONYMOUS_RETENTION_DAYS` (default 7). Runs never overlap; a failure is logged by error name only and retried next tick; logs hold counts, never project ids. Supabase mode only, not in `--once`.
- This is Phạm Quốc Bảo's area, so the PR asks for his review.
- Tests: 4 timer tests with fake timers (schedule, retry after failure, no overlap, config defaults). Smoke run of the timer against sleuth-dev with the real store: `retention_purged {"projects":0,"files":0}` (the dev project holds only the demo). I did not run the full worker loop on the dev project: the demo's seeded job is queued and the Supabase handler is not built yet, so it would mark that job failed.
- Gate: lint and typecheck clean; `pnpm test` 29 files / 358 passed, 1 todo; property 54; contracts 14; build passed.
