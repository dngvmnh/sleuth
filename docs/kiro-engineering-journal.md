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

### 2026-11-09, Đăng (@dngvmnh), BRIEF 001: one shared green main
- Merged PR #1 (`feat/backend-milestones-1-3`) with a merge commit: `deb6dbc`. Local `main` now tracks `origin/main` and fast-forwarded cleanly.
- CI on `origin/main` at `deb6dbc`: green (run 42575333370). The earlier red run at `30f588e` failed because `packages/media` was missing (typecheck: `Cannot find module '@sleuth/media'`); the PR's own red runs failed because `.gitignore` `coverage/` hid the coverage route. Both are fixed on `main` now.
- Created the `contract-change` label and added it to PR #1. Deleted the merged remote branches `fix/track-packages-media` and `feat/backend-milestones-1-3`.
- Not done: branch protection on `main`. I chose to wait, so `main` is still unprotected.
- Added the coordinator agent and the first status board in this PR.
### 2026-11-09, Đăng (@dngvmnh), ingestion 10: the worker now runs the purge
- `apps/worker/src/retention.ts`: `startRetentionTimer` runs `purgeExpiredAnonymousProjects` at start and every `RETENTION_INTERVAL_MS` (default 1 hour), period `ANONYMOUS_RETENTION_DAYS` (default 7). Runs never overlap; a failure is logged by error name only and retried next tick; logs hold counts, never project ids. Supabase mode only, not in `--once`.
- This is Phạm Quốc Bảo's area, so the PR asks for his review.
- Tests: 4 timer tests with fake timers (schedule, retry after failure, no overlap, config defaults). Smoke run of the timer against sleuth-dev with the real store: `retention_purged {"projects":0,"files":0}` (the dev project holds only the demo). I did not run the full worker loop on the dev project: the demo's seeded job is queued and the Supabase handler is not built yet, so it would mark that job failed.
- Gate: lint and typecheck clean; `pnpm test` 29 files / 358 passed, 1 todo; property 54; contracts 14; build passed.
### 2026-11-09, Đăng (@dngvmnh), ingestion 7: five-minute upload window (decision D-1, option 3)
- Supabase signed upload URLs live 2 hours and cannot be shortened. The store now enforces the 5-minute rule itself: `expiresAt` is the end of a 5-minute window (`UPLOAD_WINDOW_MS`), and `startAnalysis` asks Storage when the file landed (`StorageClient.uploadedAt`). No file: 409 `upload_missing`. A file that landed after the window: 409 `upload_late`. Requirement 2.1 and the design say so now.
- Tests on sleuth-dev with real uploads: inside the window is queued; no upload is refused; a URL made "ten minutes ago" by the store's clock with the file landing now is refused as late. 8 upload tests passed; the earlier todo is gone.
- Gate: lint and typecheck clean; `pnpm test` 28 files / 357 passed; property 54; contracts 14; build passed; ghost-scan clean.
- For Đạt: the upload flow (review-workspace 12) should show both new 409 codes. No schema change.
- Not verified: browser-to-server clock skew does not matter (both times are server times), but app-server versus database skew is assumed to be under a few seconds.
### 2026-11-09, Đăng (@dngvmnh), change-impact 9: revisions on the Supabase store
- The revision and upload paths already ran in one transaction each (ingestion 6, 7). This task proves it with the same random-history property test the fixture store passes.
- Built: `packages/db/src/change-impact-contract.ts` (`runChangeImpactContract`), moved out of the fixture-only property test. `applyAnalysisResult` now lives on the Supabase store too (shared `AnalysisWriter` type), in one transaction, writing only rows that changed. This is also the write path the worker's Supabase handler (evidence-analysis 12, Phạm Quốc Bảo) can call.
- Mutation check: with `resolvePoltergeists` removed from the Supabase write path, the 6 random histories still passed. I added a direct check to the deterministic case (the Poltergeist must be resolved after re-analysis); the mutant then failed with `expected 'open' to be 'resolved'`. Restored.
- Real results: Supabase change-impact suite 2 passed on sleuth-dev (6 histories, up to 8 steps, 107 s); fixture 200 histories passed. Gate: lint and typecheck clean; `pnpm test` 29 files / 356 passed, 1 todo; `pnpm test:property` 54 passed; `pnpm check:contracts` 14 passed; build passed; ghost-scan clean.
- Not verified in CI: the Postgres suites still skip there (next task).
### 2026-11-09, Đăng (@dngvmnh), CI database job (decision D-3)
- Goal: make ingestion 5, 6, 8, 9 and 10 provable by anyone, not only on my machine.
- Built: a `db` job in `.github/workflows/ci.yml`. It starts a throwaway local Supabase stack with the CLI (3.0.0; Postgres 17 like the hosted project, Auth with anonymous sign-in, Storage with the private `video-assets` bucket from `supabase/config.toml`), applies migrations with `pnpm db:migrate`, seeds the demo, then runs `packages/db/src/supabase` and the Supabase-mode API test. It never touches the shared dev project. `SLEUTH_REQUIRE_DB=1` makes a missing setting an error, so the job cannot go green by skipping.
- First run failed in `supabase/setup-cli` with HTTP 504 while downloading the CLI. A re-run passed, so it was the download, not our code.
- Real result (run 42578866891): 6 files, 61 passed, 1 todo, 0 skipped. The `check` job stayed green.
- Not verified: how often the CLI download flakes. If it keeps failing, cache the binary.

### 2026-11-09, Đăng (@dngvmnh), evidence-analysis 15 prepared, clip not recorded
- Waiting on: evidence-analysis 9 (Phạm Quốc Bảo, harness and the `clip.json` / `labels.json` format) and 11 (`docs/evaluation-protocol.md`). Neither exists on `main` at `27cea3a`, so the clip format is not set. `clip.json` follows the fields in the evidence-analysis design (script, checklist, durationMs, source video file name) and says it is a draft.
- Built in `tests/evaluation/clips/clip-5`: `RECORDING.md` (one-page recording script: 60 to 120 s, MP4 H.264/AAC, `clip-5.mp4` kept out of Git, where to put it, 8 lines to read and one unplanned sentence after step 3), `demo.ps1` (the on-screen API flow, step by step), `finalise.ps1` (fills length, date, SHA-256 and storage link from the real file), `clip.test.ts` (script splits into its own lines, matches `RECORDING.md`, recorded fields all empty or all filled, no labels before a recording).
- Checked: `demo.ps1 -NoPause` ran all six steps against `pnpm dev` in fixture mode (job queued). `finalise.ps1` on a generated 61 s test clip in a scratch folder wrote 61000 ms and a hash; a 30 s clip was refused; with no clip it stops. The test clip was deleted. No real clip exists.
- Not done: the recording and `labels.json`. Task 15 stays unticked.
### 2026-11-09, Đăng (@dngvmnh), worker contract for Supabase mode (inputs for evidence-analysis 12)
- Built `createWorkerStore` in `packages/db/src/supabase/worker.ts`: `loadJobInputs`, `createVideoDownloadUrl` (300 s) and `writeJobResult`. Both data calls check the queue's lease (`running` and `locked_by` = this worker) and refuse a job whose video or script was replaced (`superseded`) or that belongs to the demo. The job status stays with `pg-queue.ts`. Doc: `docs/worker-supabase-contract.md`.
- Moved the merge step out of the API store into `supabase/rows.ts` (`mergeAnalysisResult`), so the API store and the worker store share one merge.
- Contract test `worker.test.ts`: 6 passed on sleuth-dev (inputs, lease, superseded, demo, idempotent write that leaves the job `running`, targeted job that keeps other lines and resolves Poltergeists). The change-impact suite still passes after the refactor.
- Gate: lint and typecheck clean; `pnpm test` 373 passed; property 54; contracts 14; build passed.
### 2026-11-09, Đăng (@dngvmnh), coordination and launch prep
- Board and decisions updated to `main`. D-1, D-2, D-3 and D-8 moved to decided.
- D-6: the official rules page refused automated reading (HTTP 403). From a search result of the rules page I could confirm only the team clause: one person may join more than one team and also enter alone. Whether one entrant may have more than one submission is not confirmed; a person must read the page.
- ADR 0008 now has a worker section for Phạm Quốc Bảo; `.env.example` lists the two retention settings.
- Drafts, all marked DRAFT: `docs/deploy-plan.md` (prices read from vendor pages on 9 November), `docs/submission/` (Devpost, demo plan, blog, social). They quote only test numbers with their source and list what is still mocked.
- No PRs from Đạt or Bảo to review yet. Review checklist in `docs/coordination/reviews/README.md`. Daily update in `docs/coordination/updates/2026-11-09-dang.md`.
- Gate after every step: lint and typecheck clean, `pnpm test` 373 passed, build passed.
### 2026-11-09, Phạm Quốc Bảo, media worker (evidence-analysis tasks 1, 2, 4)
- Goal: FFmpeg wrapper, frame extraction with guaranteed cleanup, and property tests for the validators and the frame plan.
- Kiro feature used: chat with the evidence-analysis spec and steering loaded.
- What Kiro produced: `packages/media/src/ffmpeg.ts` (`probeDurationMs`, `extractAudio`, `extractFrames`, `withTempDir`, `MediaError`), `ffmpeg.test.ts` (clips built with `-f lavfi`), `validate.property.test.ts`, `frames.property.test.ts`.
- What we had to fix or reject: the first typecheck failed because `packages/media` and `packages/evidence-engine` had no Node types; fixed with `"types": ["node"]` in both tsconfig files (no new dependency, no lockfile change). The property tests found no bug in `validate.ts`.
- Result: FFmpeg 9.0.2 on Windows; 30 targeted tests pass (13 FFmpeg tests ran, none skipped); full gate green: lint, typecheck, `pnpm test` 317 passed and 48 skipped (database suites), `pnpm test:property` 66 passed, `pnpm check:contracts` 14 passed, ghost-scan clean.

### 2026-11-09, Phạm Quốc Bảo, evidence engine (evidence-analysis task 5)
- Goal: replace the per-line best-match search in `analyse()` with a real script alignment (exact, changed, missing, reordered, unscripted).
- Kiro feature used: chat with the evidence-analysis spec and steering loaded.
- What Kiro produced: `align.ts` (greedy best-first one-to-one assignment, longest increasing subsequence for reordered lines), `thresholds.ts` (the four constants moved out of `analyse.ts`), `align.test.ts`, `align.property.test.ts`; `analyse()` now calls `align()` and returns `alignment` next to `evidence` and `findings`; a reordered line gets a note in the evidence explanation.
- What we had to fix or reject: nothing failed. One design limit to watch on real clips: a spoken segment serves one script line, so a long spoken segment that covers two different script lines leaves the second one `missing` (requirement 3.5). The contract has no field for `reordered` or `unscripted`, so they live in `EngineOutput.alignment` and in explanation text only.
- Result: golden contract test unchanged and green; full gate green: `pnpm test` 327 passed and 48 skipped, `pnpm test:property` 71 passed, `pnpm check:contracts` 14 passed.

### 2026-11-09, Phạm Quốc Bảo, evidence engine (evidence-analysis task 6)
- Goal: move the frame window and confidence rules out of `analyse()`, build every explanation from typed inputs, and write the confidence rules in plain English.
- Kiro feature used: chat with the evidence-analysis spec and steering loaded.
- What Kiro produced: `match.ts` (`matchFrames`, `rankConfidence`), `explain.ts` (one builder per finding type and for evidence), `docs/evidence-confidence.md`, `match.test.ts` (includes a test that reads the doc and checks it states the same constants as the code), `explain.property.test.ts`.
- What we had to fix or reject: the design rule "high needs a strong frame inside the spoken time" and the old code ("strong frame anywhere in the 2 s margin") differ, so the engine now follows the design and treats a reordered line like a changed one (medium). The golden output did not change under either rule. Requirements 5.6 (Ghost names the frames checked) and 6.3 (outside-proof names the kind of proof) would change locked golden text, so they are not done here; they need a `contract-change` PR with �ang.
- Result: golden contract test unchanged and green; `pnpm test` 336 passed and 48 skipped, `pnpm test:property` 79 passed, `pnpm check:contracts` 14 passed, lint and typecheck clean.

### 2026-11-09, Phạm Quốc Bảo, evidence engine (evidence-analysis task 7, first part)
- Goal: move the outside-proof term list into its own file that the team can extend, with a proof hint per kind of claim.
- Kiro feature used: chat with the evidence-analysis spec and steering loaded.
- What Kiro produced: `outside-proof-terms.ts` (five groups: security, compliance, guarantee, performance, absolute; `classify(text)` returns the word, the kind and the proof hint), `needsOutsideProof` now calls `classify`, `outside-proof.test.ts` (12 phrases that must be flagged, 12 ordinary steps that must not). "GDPR-compliant" is now matched piece by piece; before, the hyphenated word slipped through.
- What we had to fix or reject: task 7 stays unticked. "The finding text names the kind of proof" changes locked golden text, so it goes in a separate `contract-change` PR for �ang to review. The term list also flags a script line like "Open the Security tab", which is an ordinary step; the finding says so in its limits only after that PR.
- Result: golden contract test unchanged and green; `pnpm test` 366 passed and 48 skipped, `pnpm test:property` 79 passed, `pnpm check:contracts` 14 passed.

### 2026-11-09, Phạm Quốc Bảo, evidence engine (change-impact task 4 and evidence-analysis task 8)
- Goal: make the engine honour `segmentIds` (re-analysis) and prove that running the pipeline twice is idempotent.
- Kiro feature used: chat with the change-impact and evidence-analysis specs and steering loaded.
- What Kiro produced: `EngineInput` and `PipelineOptions` take optional `segmentIds` and `existingEvidence`. A targeted run still aligns against the whole script and then keeps only the chosen lines, so its evidence equals those lines of a full run. The Ghost check reads `existingEvidence` (candidate or confirmed rows with frames, or needs_outside_proof rows) for lines it did not analyse; a claim on a skipped line covers its item from the script text. Without `existingEvidence` a targeted run raises no Ghost findings. `pipeline.property.test.ts` has 13 properties.
- What we had to fix or reject: the first version of the Ghost property failed because a skipped line with an outside-proof claim covers its checklist item without any stored evidence; the engine now reads that from the text. A targeted run's Ghost findings are still dropped by the stores (they have no script line), so this is for callers that want them.
- Result: golden contract test unchanged and green. The change-impact tasks file named `analyse.test.ts`, which does not exist; the tests are in `pipeline.property.test.ts`.

### 2026-11-09, Phạm Quốc Bảo, evaluation (evidence-analysis task 9, plus the format part of task 11)
- Goal: an evaluation harness that scores the pipeline against labels a person wrote, and fixes the clip format that clips 1 to 5 follow.
- Kiro feature used: chat with the evidence-analysis spec and steering loaded.
- What Kiro produced: `tests/evaluation/schema.ts` (Zod formats for `clip.json`, `labels.json`, `mock-inputs.json`), `report.ts` (precision and recall per finding type plus unscripted and reordered lines, every disagreement listed, header names the providers and the clip count), `run.ts` (`pnpm eval`, mock providers only; `--providers real` is refused with `provider_not_configured` until task 10), a hand-written `clips/example`, `evaluation.test.ts` (20 tests, run by `pnpm test`), `docs/evaluation-protocol.md`, the `eval` script in the root `package.json` and the results folder in `.gitignore`.
- What we had to fix or reject: precision and recall print `n/a` when the denominator is zero instead of 0%. The mock video provider filters frames by the sampled timestamps, so the harness uses its own provider that returns the hand-written frames as given; the report says mock numbers test the plumbing and the matching, not speech or vision quality. The example clip is hand-written, so its labels were not made by watching a video; the protocol and the clip say so, and it does not count as one of the five clips. Clip 5 (�ang's draft) loads with this format and is listed as "not recorded yet".
- Result: `pnpm eval` on the example clip finds all 6 labelled rows with 0 disagreements; a deliberately wrong label is reported as a disagreement (tested). Task 11 stays open: clips 1 to 3 must be recorded and labelled by a person.
### 2026-11-09, Phạm Quốc Bảo, worker (evidence-analysis task 16)
- Goal: run the queue's claim SQL against a real Postgres for the first time.
- Kiro feature used: chat with the evidence-analysis spec and steering loaded.
- What Kiro produced: `apps/worker/src/pg-queue.test.ts` (13 tests) and the file added to the `db` job in `.github/workflows/ci.yml`. The suite builds a private schema with `create table ... (like public.processing_jobs including all)` and sets `search_path` on the queue's connection, so it cannot claim another test's job or the demo job; it stops before any claim if the setting did not reach the server.
- What we had to fix or reject: I have no local database (Docker is not running, the local Postgres needs a password I do not have), so the CI `db` job on the pull request was the first run. Two workers asking at once for one job: exactly one got it. A stale heartbeat was claimed again with `attempts` 2. A stale job with no attempts left became `failed` with "Worker stopped sending heartbeats.". The claim SQL needed no change.
- Result: the CI `db` job on the PR ran `apps/worker/src/pg-queue.test.ts`: 13 passed, in 466 ms, as part of 9 files and 85 tests, all passing. Still open for �ang: the claim query takes any queued job, including the seeded `job-demo-1`; in supabase mode the worker would claim it and fail it three times.
### 2026-11-09, Phạm Quốc Bảo, worker (evidence-analysis task 12)
- Goal: replace the stub that always failed with a Supabase-mode handler that runs the pipeline on a real video.
- Kiro feature used: chat with the evidence-analysis spec and `docs/worker-supabase-contract.md` loaded.
- What Kiro produced: `supabase-handler.ts` (`createSupabaseHandler`, a factory so the handler knows its `workerId`), `download.ts` (signed-URL download with a size cap), `providers.ts`, `JobFailure` in `queue.ts`; `runPipeline` now takes the audio path and the cut frames and returns the validated transcript and observations; `supabase-handler.test.ts` (32 tests) and `supabase-handler.db.test.ts` (4 tests on Postgres).
- What we had to fix or reject: (1) The first run with real FFmpeg failed: seeking to the very end of a file leaves nothing to decode and FFmpeg exits with an error, so `extractFrames` now skips that frame (and still fails with `no_frames` when a file has no picture at all). (2) The mock providers return the golden fixture whatever the video shows; in supabase mode that would show invented results as an analysis, so the worker refuses them unless `ALLOW_MOCK_PROVIDERS=1`. Real providers are task 10. (3) The FFmpeg tests were skipping on the CI runner (6 of 13 skipped on the first PR); CI now installs FFmpeg. (4) I did not add `drizzle-orm` to the worker, to avoid a lockfile change; the database test uses plain SQL.
- Result (CI on the PR): `check` job ran `supabase-handler.test.ts` 32 passed and `ffmpeg.test.ts` 15 passed, none skipped. `db` job ran `supabase-handler.db.test.ts` 4 passed in 290 ms against local Supabase: a claimed job became candidates and findings in the database (never confirmed), a retry wrote the same rows, a worker without the lease wrote nothing, a 200 s file failed with `probe: duration_exceeded` and wrote nothing. Not done: the same flow with a real upload and real providers (needs task 10).


### 2026-11-09, Phạm Quốc Bảo, providers (evidence-analysis task 3)
- Goal: compare real providers for transcription and for video analysis and propose one of each, with a cost per run.
- Kiro feature used: chat with web search and page fetch.
- What Kiro produced: `docs/decisions/0007-provider-choice.md` (status: proposed): Deepgram Nova-3 with the per-request data opt-out for transcription, Gemini Flash on the paid tier for frames, a worst-case estimate of about $0.22 per 180-second run, and a proposed $50 monthly limit.
- What we had to fix or reject: most prices came from secondary pages that disagree on model names (Gemini 3.6, 3.7 and 3.8 Flash all appear), so the ADR says to check them on the provider's own page when the account is opened. The OpenAI figures came from a competitor's article and OpenAI's page would not load its pricing table; OpenAI is listed as not confirmed rather than guessed. Deepgram's page says opting out of data retention forgoes a discount, so the transcription price may double. Nothing was measured on our own clips.
- Result: no code changed. Task 3 stays open until Phạm Quốc Bảo confirms the picks and Đăng sets the spending limit (D-4).


### 2026-11-09, Phạm Quốc Bảo, providers (evidence-analysis task 10, code part)
- Goal: build the two real adapters from ADR 0007 behind the existing interfaces, with tests that need no network and no key.
- Kiro feature used: chat with the evidence-analysis spec, ADR 0007 and the providers' public docs.
- What Kiro produced: `packages/media/src/providers/` with `transcription-deepgram.ts` (every request carries `mip_opt_out=true`; key in a header only), `video-analysis-gemini.ts` (numbered pictures in batches of 20, JSON schema, lowest thinking level, the model answers with a picture number and the adapter maps it to the time it cut the frame at), `http.ts` (timeout, 3 attempts with backoff on 429, 5xx and network errors, no retry on a bad key), `errors.ts` (`ProviderError` with a code and nothing the provider sent; per-job call budget; `budget_exceeded`), synthetic recorded responses in `__fixtures__/`, 24 tests. The worker builds them from `TRANSCRIPTION_PROVIDER` / `VIDEO_ANALYSIS_PROVIDER` (`deepgram`, `gemini`) and refuses to start when a key is missing; `apps/worker/src/smoke.ts` (`pnpm --filter @sleuth/worker smoke -- clip.mp4`) runs one clip and prints numbers only. `zod` is added to `packages/media` (already in the lockfile; 3 lines changed).
- What we had to fix or reject: Google's docs now recommend the new Interactions API, but I could not read its REST response shape from the pages I could load, so the adapter uses the older `generateContent` endpoint whose request and response I know, and the recorded fixture follows that shape. This is an assumption: the first run with a real key must confirm it, including the `thinkingLevel` field for this model. Nothing here was run against a real provider. The first draft typed the request body as `BodyInit`, which the DOM-less packages do not have.
- Result: tests pass with recorded responses and no network (media 53 tests, worker handler tests include the provider wiring). Task 10 stays open: "the manual run returns validated data" needs the keys and the account (D-4), and no key or content may appear in its output; the smoke script prints counts only so that can be checked by searching its output.

### 2026-11-09, Đăng (@dngvmnh), decisions D-4 to D-9
- D-6 decided by Đăng from the official rules: one person may enter both DEAD AIR and SLEUTH.
- D-7: all three of us are students. Kiroween 2025 registration and age of majority are still unanswered.
- D-9 dropped: no team channel. Daily updates live in `docs/coordination/updates/`.
- Team rule: free tiers only. `docs/deploy-plan.md` now costs $0: Vercel Hobby, a scheduled GitHub Actions worker (public repo, no minute cap), Supabase Free. D-4 proposal: Deepgram sign-up credit for transcription, Gemini free tier only for our own clips, because the free tier may use content to improve Google's products. Limits were read from vendor pages on 9 November.
- Board refreshed to `main` `31d09ee` (Phạm Quốc Bảo merged PRs #9 to #19).
- Checks: lint and typecheck clean; repo config tests 42 passed. Docs only, so the database suites were not re-run.
## 2026-11-10: upload size and type limits (contract change)

- `POST /projects/{id}/assets/upload-url` now requires `sizeBytes` (integer, 1 to `MAX_VIDEO_BYTES` = 52428800). `mimeType` must be one of `ALLOWED_VIDEO_TYPES` (mp4, quicktime, webm, x-matroska). Both are exported from `@sleuth/contracts`.
- `checkLimits` gained `sizeBytes` and `config.maxVideoBytes` with codes `invalid_size` and `video_too_large`. Both stores use it and answer 400 `invalid_request` with `reason` and `maxVideoBytes` in the details.
- Tests: domain unit and property tests, a store-contract property test (runs on the fixture and Supabase stores), and route tests for each refusal and each allowed type at exactly 50 MB.
- For Dat: send `sizeBytes: file.size` and use `file.type` in the upload call, and show a clear message on 400 before uploading.
- For Bao: nothing changes in the worker. `MAX_VIDEO_BYTES` keeps the same default.

### 2026-11-08, Đạt (@phatdat220707), review-workspace tasks 1–2

- Goal: add component test tooling (task 1) and complete the typed API client (task 2).
- Kiro features used: chat in agent mode, always-on steering (product, architecture, coding-standards, team-workflow, frontend, ai-safety), review-workspace spec.

**Task 1 — Component test tooling**

Added root dev dependencies (exact versions): `jsdom@26.1.0`, `@testing-library/react@16.3.0`, `@testing-library/dom@10.4.2`, `@testing-library/user-event@14.6.1`, `@testing-library/jest-dom@6.6.3`, `@axe-core/playwright@4.9.1`, `@vitejs/plugin-react@6.2.1`.

`@vitejs/plugin-react` was required because Vitest 5 uses Vite's `vite:import-analysis` plugin before any oxc transformer runs, and `apps/web/tsconfig.json` sets `"jsx": "preserve"` for Next.js. The React plugin transforms JSX first, bypassing the preserve setting. No other solution worked without modifying the shared tsconfig.

Converted `vitest.config.ts` from a single-project config to a two-project workspace: `node` (existing `.test.ts` files stay in Node) and `web` (`.test.tsx` files under `apps/web` run in jsdom). Added `apps/web/lib/**/*.test.ts` to the node project include to cover the api-client test added in task 2.

Created `tests/setup/web.ts`: imports `@testing-library/jest-dom/vitest` (extends Vitest's `expect` with DOM matchers) and calls `cleanup()` after each test.

Wrote a temporary `apps/web/features/example.test.tsx` with a Counter component. Verified: 3 tests passed (`pnpm exec vitest run --project web`, 2026-11-08). The tests covered `render`, `getByRole`, `toHaveTextContent` (jest-dom matcher), `userEvent.click`, and `vi.fn()` spy. Deleted the file after verification as the task requires.

Pre-existing scaffold issue: `packages/media/` is ignored by the `media/` rule in `.gitignore` and was never committed. A stub was added on disk to unblock `pnpm install`; it is ignored by git. This caused a `pnpm typecheck` failure in `packages/evidence-engine` (imports from the stub, which exports nothing). That failure pre-dates this session — blocker is Bảo's (`packages/media` implementation).

**Task 2 — Complete the API client**

Added 6 methods to `apps/web/lib/api-client.ts`: `createUploadUrl`, `createScript`, `setChecklist`, `startAnalysis`, `getJob`, `createReshoot`. All use existing contract schemas from `packages/contracts/src/endpoints.ts`. Input is validated with the request schema before sending, so invalid inputs (wrong mimeType, empty text, empty items array, empty note, over-limit duration) throw a `ZodError` before any network call.

Created `apps/web/lib/api-client.test.ts` with 26 tests covering all 12 client methods plus the error-handling helpers. Test fixtures were built from the exact entity schemas in `packages/contracts/src/entities.ts`.

**Real verification results (2026-11-08, Node 24.18.0, pnpm 10.12.1)**

| Command | Result |
|---|---|
| `pnpm exec vitest run --project web` (example.test.tsx before deletion) | 3/3 passed |
| `pnpm exec vitest run --project node apps/web/lib/api-client.test.ts` | 26/26 passed |
| `pnpm lint` | clean |
| `pnpm test` | 176 passed, 2 failed (baseline: worker + golden-contract, both need `packages/media`) |
| `pnpm test:property` | 13/13 passed |
| `pnpm typecheck` | fails on `packages/evidence-engine` (baseline: needs real `packages/media`) |
| `pnpm check:contracts` | 10/11 passed; 1 failed (baseline: golden pipeline needs mock providers from `packages/media`) |

No commit or push was made. Changes left uncommitted for review.

**Baseline failures (pre-existing, not caused by this work)**

- `apps/worker/src/worker.test.ts > claims the fixture job…`: requires real `@sleuth/media` mock providers — Bảo's work.
- `tests/contract/golden.contract.test.ts > worker pipeline…`: same cause.
- `pnpm typecheck` on `packages/evidence-engine`: same cause.

**Files changed this session**

- `package.json` (root) — 7 new dev deps
- `pnpm-lock.yaml` — updated
- `vitest.config.ts` — two-project workspace config
- `tests/setup/web.ts` — new (jsdom setup + cleanup)
- `apps/web/lib/api-client.ts` — 6 methods added
- `apps/web/lib/api-client.test.ts` — new (26 tests)
- `packages/media/package.json` — stub only, git-ignored
- `packages/media/src/index.ts` — stub only, git-ignored

Kiro produced the full implementation. No corrections needed on the client methods or test structure; the test fixture shapes had to be corrected once after reading the real entity schemas.

### 2026-11-08, Đạt (@phatdat220707), review-workspace — integration attempt for packages/media

- Goal: integrate Đăng's `.gitignore` fix and real `packages/media` from origin/main, then re-run full checks.
- Kiro features used: chat in agent mode.

**What was checked**

- `git fetch --all` run. `origin/main` still at `30f588e` (same as HEAD). Đăng's commit has not arrived on the remote as of this run.
- Local `packages/media/` is still the stub from this session: `package.json` (no scripts, no tsconfig) and `src/index.ts` (comment only). No other files.
- `.gitignore` on `origin/main` still has `media/` (unanchored). No change on remote.

**What was done**

- Fixed `vitest.config.ts` node project include: replaced the separate `apps/web/app/**/*.test.ts` and `apps/web/lib/**/*.test.ts` entries with a single `apps/web/**/*.test.ts` glob. This ensures future `.test.ts` files in `apps/web/features/` (timeline geometry, segment-at) are discovered in the Node environment without needing further config changes.
- No stash needed: no merge possible since origin/main has not changed.
- No stub files removed: cannot verify the stub against Đăng's real implementation until the push arrives.

**Check results (2026-11-08, after vitest.config.ts glob fix)**

| Command | Result |
|---|---|
| `pnpm lint` | ✅ clean |
| `pnpm test:property` | ✅ 13/13 |
| `pnpm test` (node + web projects) | 176 passed, **2 failed** (same baseline: mock provider stubs) |
| `pnpm typecheck` | **fails on `packages/evidence-engine`** — stub `src/index.ts` is not a module |
| `pnpm check:contracts` | 10/11 passed, **1 failed** — `createMockTranscriptionProvider is not a function` |

All remaining failures trace to `packages/media` stub. They will clear once Đăng's real implementation arrives and the `.gitignore` fix lands on origin/main.

**Pending action — needs Đăng**

Once Đăng's commit is on origin/main: run `git fetch`, `git stash push --include-untracked -m "task1-2-changes"`, `git merge origin/main`, restore stash, delete the stub files (`packages/media/package.json` and `packages/media/src/index.ts`), run `pnpm install`, re-run all checks. At that point all 5 checks should be green.

No commit or push made.

### 2026-11-08, Đạt (@phatdat220707), review-workspace — integration of fix/track-packages-media complete

- Goal: integrate Đăng's `fix/track-packages-media` branch (commit `f549c1c`) and re-verify tasks 1–2 with the real `packages/media` implementation.
- Kiro features used: chat in agent mode.

**Integration steps**

1. Fetched `origin/fix/track-packages-media`. Confirmed: one commit (`f549c1c`) on top of `30f588e` (our HEAD) — fast-forward eligible.
2. Inspected stub vs real files before acting:
   - Stub `packages/media/src/index.ts`: comment only. Real: `export * from "./providers"; export * from "./mocks"; export * from "./validate";` — different, confirmed stub was safe to remove.
   - Stub `packages/media/package.json`: no scripts, no dependencies. Real: has `typecheck` script and `@sleuth/contracts` dep.
3. Stashed all task 1–2 changes (tracked + untracked) as `task1-2-web-test-tooling`. Confirmed stash saved.
4. Deleted stub files individually: `packages/media/package.json`, `packages/media/src/index.ts`, then empty dirs. (Stub was git-ignored; stash had not captured it.)
5. `git merge --ff-only origin/fix/track-packages-media` — clean fast-forward, HEAD now at `f549c1c`.
6. `git stash pop` — all 6 modified files and 2 untracked entries restored without conflict.
7. `pnpm install` — resolved with real `@sleuth/media` workspace package.
8. Confirmed `.gitignore` now has `/media/` (anchored) — `packages/media` no longer ignored.

**Final check results (2026-11-08, Node 24.18.0, pnpm 10.12.1, HEAD f549c1c)**

| Command | Result |
|---|---|
| `pnpm lint` | ✅ clean |
| `pnpm typecheck` | ✅ all packages pass (media, evidence-engine, web, worker) |
| `pnpm test` | ✅ **183/183 passed** (0 failures) |
| `pnpm test:property` | ✅ 13/13 |
| `pnpm check:contracts` | ✅ 11/11 + openapi.yaml matches |
| `apps/web/lib/api-client.test.ts` | ✅ 26/26 |

No commit or push made. Changes left uncommitted for Đăng's review.

## 2026-11-09 Review workspace task 3 (app shell and dashboard), Đạt

Kiro added the workspace shell (`app/(workspace)/layout.tsx`: header, nav, skip link; fog stays in the root layout), `components/state-panel.tsx` (loading, empty, error with retry, processing), `features/dashboard/` (`use-dashboard.ts`, `project-list.tsx`) and rewrote `app/(workspace)/page.tsx` to use the typed API client. The "Create a project" action calls `createProject(name, true)` (copy-from-demo) with pending and error handling. The contract exposes only name, `isDemo` and `createdAt`, so no findings counts or "last updated" time are shown.

Verification: lint clean; typecheck clean; `pnpm test` 188/188 (5 new component tests: loading, empty, demo list, error plus retry, create error); `test:property` 13/13; `check:contracts` 11/11; `test:e2e` 6/6 after `playwright install chromium`. The `smoke.spec.ts` link locator was updated because the dashboard now has an extra "Open demo" link.

Not complete: the demo link goes to `/projects/proofpay-demo`, which has no page until task 6. The e2e test checks only the URL, not workspace content. Task 3 is left unticked for that reason.

## 2026-11-09 Task 3 review pass, Đạt

Kiro passed the `creating` state to `EmptyState`/`StatePanel` (button disabled, "Creating...") and added a ref guard in `useDashboard` so a second create cannot send a second POST. Each row now shows open findings from `listFindings` (status `open` only); if that request fails the row says "Open findings unavailable" and shows no number. Projects are sorted newest created first (`sortNewestFirst`, tie on id).

Limit for Đăng to confirm: the contract has no "last change" field on `Project`. Requirement 1.2 says "last change", but the row shows only the creation date and the order is by `createdAt`. Needs a field such as `updatedAt` (or a derived value) in the contract before 1.2 is fully met.

Verification: lint, typecheck clean; `pnpm test` 194/194 (11 dashboard component tests, including create then reload and one POST while pending); `test:property` 13/13; `check:contracts` 11/11; `test:e2e` 6 passed, 1 skipped. The skipped test is "opening the demo shows the demo workspace", blocked on task 6 (`/projects/[id]` does not exist). Task 3 stays unticked.

## 2026-11-09 Review workspace task 4 (pure timeline helpers), Đạt

Also in this session: the focus ring fix. Tailwind `transition-colors` animated `outline-color`, so the ring started as the text colour (dark on the primary button) and faded to `--sleuth-focus` over 150 ms. `globals.css` `:focus-visible` now leaves `outline-color` out of `transition-property`. `tests/e2e/focus.spec.ts` (8 tests: desktop and mobile, with and without reduced motion) reads the ring at once after Tab and checks style, 2 px width, offset, token colour and 3:1 contrast against the page; 6 of 8 failed with the fix removed.

Task 4: Kiro added `apps/web/features/timeline/geometry.ts` (`clamp`, `msToPercent`, `percentToMs`) and `segment-at.ts` (`segmentAtMs`, generic over `{ startMs, endMs }`), with `geometry.property.test.ts` and `segment-at.property.test.ts` (fast-check).

Decisions: duration of 0, negative or non-finite maps everything to 0% and 0 ms. Inputs are clamped, not extrapolated; non-finite input counts as the start. `percentToMs` returns whole ms. Intervals are half-open (`startMs <= ms < endMs`), so touching intervals never both match (the later one owns the shared instant), empty intervals never match, and `ms === endMs` of the last interval has no match. If intervals overlap, the first in input order wins.

Verification: lint and typecheck clean; `pnpm test` 214/214; `pnpm test:property` 33/33, with both new files discovered and run (10 tests each); `check:contracts` 11/11. Task 4 ticked. Task 3 stays unticked (task 6 demo page, and no "last change" field in the contract).

## 2026-11-09 Review workspace task 5 (player port and simulated player), Đạt

Kiro added `apps/web/features/player/`: `player-port.ts` (`PlayerPort`, change events, `clampTimeMs`, `normaliseDurationMs`, reusing `clamp` from the task 4 geometry), `simulated-player.ts` (manual clock with `tick`), `html-player.tsx` (`HtmlVideoPlayer` over a `VideoElementLike`, which a real `<video>` satisfies) and `no-video-panel.tsx` (states that fixture mode has no video and nothing plays real footage).

Decisions: time is whole ms within 0..duration, same as the timeline helpers. A duration of 0, negative or non-finite means nothing to play. `tick` moves time only while playing; ignored for a delta that is 0, negative or not finite. Reaching the end stops at exactly the duration and emits `ended`. `play` at the end restarts from 0. Seeking to the end during playback ends it. Listeners are copied before notifying, so unsubscribing inside a listener is safe. `PlayerPort` has `dispose()`, which clears subscribers and (for the HTML adapter) removes the DOM listeners. If the browser rejects `play()` (autoplay rules) the adapter stays paused and emits nothing.

Verification: lint and typecheck clean; `pnpm test` 243/243; `pnpm test:property` 33/33; `check:contracts` 11/11. New tests were discovered and ran: `simulated-player.test.ts` 18, `html-player.test.ts` 9 (stub element, no media, no network), `no-video-panel.test.tsx` 2. Task 5 ticked. Task 3 stays unticked (task 6 demo page, no "last change" field in the contract).

Limits: nothing yet drives `tick` from a timer or uses the panel; that belongs to the workspace page (task 6). The HTML adapter was tested only against a stub, not a real browser video.

## 2026-11-09 Review workspace task 6 (workspace data hook and page skeleton), Đạt

Kiro added `app/(workspace)/projects/[id]/page.tsx`, `features/workspace/use-project.ts`, `workspace.tsx` (plus `test-fixtures.ts` for tests) and `features/player/simulated-clock.tsx`. `LoadingSkeleton` got an optional `label`.

`useProject(projectId)` loads project detail, evidence and findings through the typed client and exposes `status` (`loading`, `error`, `not_found`, `empty`, `done`), `refresh` and `review`. A 404 is `not_found`; other errors keep their message. A response for an earlier project, an earlier attempt or an unmounted component is dropped, and the old project is never shown while a new id loads. `review` sends one request at a time, replaces the returned evidence, reloads findings, and shows the server's refusal text; nothing in the UI sets `confirmed` itself, the status only changes when the server returns it after a human decision.

The workspace shows the real script from the fixture in order, evidence and findings counts (open findings counted by type, spooky label with plain label), and labelled regions for Player, Timeline (placeholder), script and Evidence Lantern (placeholder). The player area shows `NoVideoPanel` and a `SimulatedClock` (play, pause, slider). The page never renders a `<video>`: the API exposes no playable video source (only a placeholder storage path), so the real adapter is not wired. One interval runs only while playing; it, the subscription and playback stop on unmount, and re-rendering does not add timers.

Verification: lint and typecheck clean; `pnpm test` 266/266 (new: 9 hook, 7 workspace, 7 clock tests); `test:property` 33/33; `check:contracts` 11/11; `test:e2e` 19/19, no skipped. The test that was `fixme` now clicks Open demo on the dashboard and checks the heading, the first script line and "4 evidence candidates, 4 findings (4 open)". Visual check with Playwright screenshots at 1280 and 390 px: no horizontal overflow, no text under 12 px. Task 6 ticked.

Task 3: the "open the demo" blocker is removed. It stays unticked because requirement 1.2 needs a "last change" field that `Project` does not have (Đăng to confirm).

Limits: the HTML player adapter is still unused; it needs a playable video URL from the API (a signed-URL endpoint) before it can be wired. Timeline markers, sentence states and click-to-seek, and review buttons are later tasks.

## 2026-11-09 Handoff: tasks 7, 8, 9 implemented, not yet ticked, Đạt

Stopped on request (machine hot). Nothing was committed or pushed; all changes are uncommitted in `feat/web-test-tooling`. Tasks 1 to 6 are done and ticked. Task 3 stays unticked (no "last change" field on `Project`; Đăng to confirm). Tasks 7, 8 and 9 are NOT ticked.

Built so far (code and tests exist):
- Task 7: `features/timeline/state.ts` (TEMPORARY adapter for `deriveSegmentStates`, same signature, rules from change-impact design; delete it and use `packages/domain` when Đăng's task lands, and move or replace `state.test.ts`), `markers.ts`, `timeline.tsx`, `components/live-region.tsx`.
- Task 8: `features/script/sentence-list.tsx`, `features/player/use-simulated-player.ts` (one shared player and one interval), `simulated-clock.tsx` now takes that player; `workspace.tsx` rewired so the player, timeline playhead, sentence highlight (`segmentAtMs`) and Lantern share one clock. "Play this part" stops at the end of the part.
- Task 9: `features/lantern/lantern.tsx`, `components/finding-badge.tsx`.
- Tests: `state.test.ts`, `markers.test.tsx` (renamed from .ts because the `@/` alias only exists in the jsdom project), `timeline.test.tsx`, `lantern.test.tsx`, `workspace-flow.test.tsx`, updated `workspace.test.tsx`, `simulated-clock.test.tsx`, `test-fixtures.ts`; `tests/e2e/investigation.spec.ts` (10 tests, includes axe).

Checks actually run, and when:
- Before the last layout edit: lint clean; typecheck clean; `pnpm test` 327/327; `test:property` 33/33; `check:contracts` 11/11; `test:e2e` 29/29; production `pnpm build` passed (also passed once before task 7 started); Playwright screenshots at 1280 and 390 px showed no horizontal overflow, no text under 12 px, focus ring amber 2 px, fog hidden under reduced motion.
- After the last layout edit (timeline marker lanes, `h-28`; sentence list `basis-48` and badge padding): only `pnpm build` and one screenshot run. Unit tests, e2e, lint and typecheck were NOT re-run after this edit.

Open issues:
1. Mobile (390 px) sentence list: the first screenshot showed the line text squeezed into a very narrow column with the badge overlapping it. The edit meant to fix this was made, but the screenshot taken afterwards looked the same, so the fix is unverified and may not work. Needs a look at `features/script/sentence-list.tsx` (the button uses `flex flex-wrap`).
2. Mobile timeline: markers for lines 1 and 2 overlapped before the lane change; the lane change is unverified.
3. Design says focus goes to the Lantern heading on keyboard marker activation; task 8 says the sentence is focused. The code focuses the sentence (task 8 acceptance). Escape also returns to the sentence list (requirement 8.1).
4. The HTML video adapter is still unused: the API has no playable video URL.
5. In `use-simulated-player.ts` the player is not disposed on unmount (only paused and unsubscribed), so React strict mode can re-run the effect.

Next steps when resuming (do in order, one check at a time):
1. Fix the mobile sentence-list layout; look at a 390 px screenshot to confirm.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts`, `pnpm test:e2e`, then `pnpm build`.
3. If all pass, tick tasks 7, 8 and 9 in `.kiro/specs/review-workspace/tasks.md` and note the temporary adapter in the journal. Do not start task 10.

## 2026-11-09 Tasks 7, 8, 9 completed (resumed from the handoff), Đạt

Resumed from the handoff entry. The 390 px problem in the handoff was a stale screenshot: it was taken before the layout edit was built. After a fresh `pnpm build` (fixture mode) and `next start`, a 390 px check showed: line text 246 px wide on every row, the state badge under the text and not over it, no horizontal overflow, and all four timeline markers hit-testable (markers sit in two lanes). No further code change was needed.

Flow check at 390 px and 1280 px on the production build: clicking the marker for line 2 set the clock to 4.0 s, focused line 2 and showed "Evidence for line 2"; clicking the marker for line 1 gave 1.0 s and "Evidence for line 1"; on desktop the marker for line 3 gave 11.0 s and its Lantern. Screenshots (scratch, removed with the session): `final-mobile.png`, `final-desktop.png`.

Checks after the last app code change (run in this order): `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test` 327/327; `pnpm test:property` 33/33; `pnpm check:contracts` 11/11 plus openapi match; `pnpm build` passed. After that only e2e spec files changed (longer waits, see below); lint and typecheck were re-run and are clean.

`pnpm test:e2e`: 29/29 passed with `--workers=4` and in an earlier run today with the default workers. With the default 16 workers on this slower machine the run failed in this session: 1 to 7 tests timed out at about 30 s, a different set each time (dev mode compiles each route on first visit while all workers start at once; a failing page snapshot showed the page had rendered). A single spec file alone passed. This looks like load, not an app bug, but it is not proven. Changes to tests for it, none weakening an assertion: `expect.configure({ timeout: 30_000 })` in `dashboard`, `smoke`, `workspace` and `focus` specs, and `test.setTimeout(90_000)` on the open-demo test. If CI runs with default workers on a slow runner, expect the same; fix would be a warm-up step or fewer workers in `playwright.config.ts` (root config, Đăng).

Task state: 1 to 9 ticked (7, 8, 9 now). Task 3 stays unticked (needs a "last change" field on `Project`, Đăng). Task 10 not started.

Remaining temporary adapter: `apps/web/features/timeline/state.ts` (`deriveSegmentStates`) replaces nothing in the domain package yet. When Đăng's change-impact task 2 lands in `packages/domain`: delete this function, import the domain one, keep `STATE_LABELS` (move it if the domain does not own labels), and move or replace `state.test.ts` with the domain tests. Open question for Đăng: the design does not define "valid" in rule 1 (outside_proof); the adapter reads it as confirmed, candidate or needs_reshoot.

Not verified: real-browser keyboard use with a screen reader (no Narrator or NVDA pass yet, design asks for one); the HTML video adapter is still unused (the API has no playable video URL); focus goes to the sentence on marker activation (task 8 acceptance), not to the Lantern heading as the design text says.

## 2026-11-09 Task 10 (Exorcism actions and reshoot note), Đạt

Started 11:32. The previous attempt was cut off while `review.spec.ts` ran (the command hung 10 min with no output; no result was recorded).

Kiro added `apps/web/features/lantern/actions.tsx` (`ExorcismActions`) and `actions.test.tsx`, wired it into the Lantern through a new `actions` slot, and extended `useProject` with `reshoot(evidence, note)` and `reviewErrorId`. `review` now returns whether it succeeded. One request runs at a time (shared guard for review and reshoot). Needs reshoot opens an inline note; it records the `needs_reshoot` decision first and only then calls `createReshoot` with the line's segment and checklist item, so a refused decision creates no task. Demo: all four actions disabled with the reason as their description. Stale evidence: only "Dismiss" (sent as `reject`), the rest disabled with the reason. The server's error text is shown unchanged in `role="alert"`, only on the evidence it belongs to. Saved and refused decisions are announced in the workspace live region. The status shown comes from the server response; nothing in the UI sets `confirmed`.

Requirements: 6.1 decisions call the endpoint, update evidence and reload findings, announce (unit + e2e); 6.2 refusal shows the server message and leaves the screen unchanged (e2e uses a real refusal: the line is edited through the API so its evidence goes stale on the server, then Confirm returns "Decision refused: stale_needs_reanalysis."); 6.3 note and reshoot task (e2e checks the 201 body); 6.4 demo and stale reasons (unit + e2e for demo); 6.5 no bulk control (unit + e2e).

Fix during checks: the e2e "no bulk control" regex matched the script line "All customer data ..."; it now matches action phrases (bulk, select all, confirm all) and checks there are no checkboxes. Lint asked for `cause` on a re-thrown error.

Checks (fixture mode, after the last change unless noted): `vitest run` lantern + workspace 48/48 then use-project 11/11 and workspace-flow (new announce tests) pass, exit 0; `playwright test tests/e2e/review.spec.ts --workers=1` 5/5, exit 0 (before the lint `cause` fix, which does not touch the tested path); `pnpm lint` exit 0; web `typecheck` exit 0. Full `pnpm test`, `test:property`, `check:contracts`, full e2e and build: run at the end of this session. Task 10 ticked.

## 2026-11-09 Task 11 (script and checklist editors), Đạt

Kiro added `features/script/script-editor.tsx`, `features/checklist/checklist-editor.tsx`, `features/workspace/editors-panel.tsx` and their tests, and `saveScript`, `saveChecklist`, `makeCopy` in `useProject`. After a save the hook reloads project, evidence and findings without the loading state, so the sentence list and timeline show the server's new states.

- 3.1: Save script posts a new version (`createScript`); the summary lists changed and added lines from `diff`, removed lines as a count, and the stale count from `staleEvidenceIds`.
- 3.2: lines keep the server's segment ids; the list re-renders from the new `scriptVersion`.
- 3.3: "No evidence affected." is shown when the server returns no stale ids. The UI does not decide this.
- 3.4: checklist add (button or Enter), remove, Up and Down, Save sends the whole list in order; an empty list cannot be saved; server errors shown as alerts, the edited list kept.
- 3.5: on the demo both editors are read-only, a note says so, and "Make an editable copy" creates a copy (`createProject(name, true)`) and opens it.

Checks after the last change: `vitest run apps/web/features` 177/177, exit 0; `playwright test tests/e2e/editors.spec.ts tests/e2e/review.spec.ts --workers=1` 9/9, exit 0 (editing line 3 shows only "Line 3 changed" and 1 stale candidate, line 3 becomes Poltergeist and lines 1, 2, 5 keep their states; a punctuation-only edit on line 2 shows "No evidence affected."; checklist order checked through the API; demo copy opens an editable project); `pnpm lint` exit 0; `pnpm typecheck` exit 0. Task 11 ticked.

## 2026-11-09 Task 12 (upload flow) and end-of-session checks, Đạt

Kiro added `features/upload/duration.ts` (`readVideoDurationMs` reads only metadata through a `<video>` element and releases the object URL; `checkDurationMs` applies `MAX_VIDEO_MS` from contracts), `features/upload/upload-flow.tsx` and tests, and `requestUploadUrl` and `sync` in `useProject`. The flow sits in the workspace above the editors.

- 2.1: the length is read in the browser; above 180 s it is refused with "This video is 200 seconds long. The limit is 180 seconds. Trim it and try again." and nothing is sent. A non-video file is refused too.
- 2.2: accepted files call `createUploadUrl` with name, type and length, then upload with a progress bar. Fixture mode returns a `fixture://` URL: no bytes are sent and the UI says so. After success the workspace reloads, and the evidence for the old video shows as Poltergeist (the server marks it stale). The "processing state" (job polling) belongs to task 13 and is not built; the done message says to run an analysis.
- 2.3: a failure says which step failed and shows the server's text; Try again repeats only that step with the same file. Script and checklist drafts live in their own editors and are kept (e2e checks both).
- 2.4: the limits text is next to the file picker and is its accessible description.

E2E note: no real video file is committed, so `upload.spec.ts` stubs the browser's media metadata (`HTMLMediaElement` `duration` and the `src` setter) to fire `loadedmetadata` with 200 s or 52 s. The app's reader, limit check and flow run unchanged.

Fixes found by the full run:
- Script lines also appear inside the script editor textarea, so two e2e `getByText` lookups in `dashboard.spec.ts` and `workspace.spec.ts` matched twice. They are now scoped to the script list.
- `useSimulatedPlayer` could miss a seek made before its effect subscribed: the clock still showed 0.0 s (seen in 1 of about 13 unit runs). The display now reads the player through `useSyncExternalStore`, and the timer effect checks `player.playing` when it subscribes. After the change: workspace-flow alone 15/15 clean runs, `apps/web/features` 12/12, full `pnpm test` 6/6. One failure ("moves the playhead and the slider together") was seen once in 10 runs of workspace-flow and player run together, right after the change; it did not repeat in the 33 later runs. Cause not found.

Final checks, run in order after the last code change (fixture mode):
| Check | Result | Exit |
|---|---|---|
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean | 0 |
| `pnpm test` | 378/378 (6 runs) | 0 |
| `pnpm test:property` | 33/33 | 0 |
| `pnpm check:contracts` | 11/11, openapi matches | 0 |
| `playwright test --workers=1` (all specs) | 41/41, none skipped | 0 |
| `pnpm build` | passed | 0 |

Visual check: production build at 390 px on a copy after a confirm and a script save: no horizontal overflow, no text under 12 px. Screenshot `t10-12-mobile.png` in the session scratch folder (removed with the session). The `next start` server opened for it was stopped.

Task state: 1, 2 and 4 to 12 ticked. Task 3 waits for a "last change" field on `Project` (Đăng). Not started: 13 onward. No API or contract change was needed.

Still open:
- The temporary `features/timeline/state.ts` adapter. Replace it when Đăng's `deriveSegmentStates` lands.
- No screen reader pass yet.
- Full e2e is reliable with `--workers=1`. Default workers on this machine timed out earlier today; that is a root `playwright.config.ts` question for Đăng.
- Decision buttons stay available after a decision (the server allows changing it). Ask Đạt whether that is wanted.

Next: task 13 (job polling and workspace states).

## 2026-11-09 Task 13 (job polling and workspace states), Đạt

Started 11:58. Kiro added `features/workspace/use-job-poll.ts`, `analysis-panel.tsx` with `analysis-panel.test.tsx`, `tests/e2e/analysis.spec.ts`, and `startAnalysis` and `fetchJob` in `useProject`. The panel sits after the upload panel and uses `ProcessingState` from `components/state-panel.tsx`.

- 7.2: one check every 2 s while the job is `queued` or `running`. The next check is set only after the previous answer, so checks never overlap. Polling stops at `succeeded` or `failed`, when another job is watched, and on unmount. Each watch has a generation number, so a late answer for an older job is dropped. The UI shows status and "Attempt n of max". A failed check shows a warning and polling goes on.
- 7.3: a failed job shows its `error` text and the attempts as an alert. Try again calls `startAnalysis` again, which creates a new job, and follows that job.
- 7.4: on success it reloads project, evidence and findings (`sync`) and shows how many items still need a person: candidates not yet decided (`candidate` or `needs_outside_proof`) and open findings.
- Demo: no Run analysis button, with a read-only note.

Fixture limit: the web app runs no worker, so a real job stays `queued` with attempts 0. The UI shows that real state and says a job stays queued when no worker is running. The running, succeeded and failed paths are covered only by component tests with fake timers and simulated job answers. No API or contract change was needed.

Checks after the last change: `vitest run` analysis-panel and editors-panel 11/11, exit 0 (fake timers: queued -> running -> succeeded, queued -> failed -> Try again -> succeeded, no overlapping checks, a late answer dropped, cleanup on unmount, a failed check, a start error, demo). `playwright test tests/e2e/analysis.spec.ts --workers=1` 3/3, exit 0. Against the real fixture API: POST returns 202 with a `queued` job; at least 3 checks at least 1.9 s apart, never two at once; the API still says `queued` and so does the UI; leaving for the dashboard stops all checks for 5 s; the demo cannot start one. `pnpm lint` exit 0; `pnpm typecheck` exit 0. Task 13 ticked.

## 2026-11-09 Task 14 automated part, and end-of-session checks, Đạt

After the task 13 entry, lint flagged that `schedule` in `use-job-poll.ts` called itself before it was declared. It now uses an inner `next()` function. The analysis-panel unit tests (8/8) and `analysis.spec.ts` (3/3) were re-run after this fix and passed.

Task 14 (automated part only): Kiro added `tests/e2e/a11y.spec.ts` (9 tests) and `docs/accessibility.md`.
- Axe with WCAG 2.0/2.1 A and AA tags, with motion on and with reduced motion, on three pages: the dashboard, the demo workspace with the Lantern open, and an editable copy with review actions and the reshoot note open. Result: 0 serious or critical issues, and 0 violations of any impact.
- Axe left color-contrast as "incomplete": 6 nodes on the dashboard and 1 on each workspace page. These are probably the translucent header and the fog. They are unverified.
- Reduced motion: the fog is hidden and no element has a running animation while the page loads.
- Keyboard: skip link, open demo, timeline Tab, arrows, Enter and Escape, choosing a line, a visible focus ring, and confirming with the keyboard on a copy.
- No frontend code change was needed.
- The doc lists 16 Narrator/NVDA steps for Đạt to run, and the known gaps.
- Task 14 is NOT ticked: the manual walkthrough has not been done.

Test fixes from the full e2e run (none change what is asserted):
- `focus.spec.ts` stopped tabbing after 12 stops. Copies made by earlier specs make the dashboard list longer, so the limit is now 80.
- `investigation.spec.ts` paused before the clock had moved: 11.0 s is already inside line 3. It now waits for the clock to move before pausing.
- `a11y.spec.ts` uses `Array.from` for typecheck.

Final checks, fixture mode, in this order:
| Check | Result | Exit |
|---|---|---|
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean (after the `Array.from` fix) | 0 |
| `pnpm test` | 386/386 | 0 |
| `pnpm test:property` | 33/33 | 0 |
| `pnpm check:contracts` | 11/11, openapi matches | 0 |
| `pnpm build` | passed | 0 |
| `playwright test --workers=1` (all 12 specs) | 53/53, none skipped | 0 |

Code did not change after the unit-test and build runs. Only e2e spec files changed, and lint, typecheck and the full e2e run were done after those changes.

Servers: one `next start` was opened for the axe dump and was stopped; port 3000 is free.

Task state: 1, 2 and 4 to 13 ticked. Task 3 waits for Đăng ("last change" field). Task 14 waits for the manual screen-reader pass. The temporary timeline adapter `features/timeline/state.ts` is unchanged.

## 2026-11-09 Task 14: the 8 color-contrast "incomplete" items, Đạt

Started 13:20, done 13:23. Production build, fixture mode, Chromium 1280x900. Kiro found each node axe left as color-contrast "incomplete":
- 6 on the dashboard. Axe's reason was "background gradient", from the fog and the translucent header.
- 1 on the demo workspace and 1 on the editable copy. Both were the script editor textarea; axe's reason was "partially obscured".

For each node, Kiro made the text transparent, took a screenshot of its box, read the darkest and lightest pixels, and computed the WCAG ratio of the computed text colour against both.

All 8 pass AA. Worst ratios:
- header wordmark 8.64:1
- header "Dashboard" link 6.64:1 (the lowest)
- h1 14.08:1
- intro text 8.30:1
- "Projects" 15.07:1
- "What the findings mean" 16.08:1
- textarea 16.18:1 on both pages

For the textarea, 84,315 of 84,320 pixels are #0e0b16; the other 5 are the native resize grip. `elementFromPoint` finds nothing covering it.

With reduced motion the fog is off, and the 6 dashboard items are not reported at all.

No CSS change was needed, so `a11y.spec.ts` was not re-run (no code changed since its last 9/9 pass). The table and its limits are in `docs/accessibility.md`: one viewport, one moment of the fog drift, hover colours not measured, High Contrast mode not checked.

The server opened for this was stopped; port 3000 is free. Task 14 stays unticked until the manual Narrator or NVDA walkthrough in `docs/accessibility.md` is done.

## 2026-11-09 Task 14 manual walkthrough, group 1, Đạt

At 13:26 Kiro rebuilt and started `next start` in fixture mode on port 3000, and created the editable copy `proj-1` ("Narrator copy") through the API.

Group 1 (dashboard and skip link) was reported by Đạt as a keyboard and visual check in Chrome/Playwright. The tab order and focus behaved as expected: skip link first, Enter into the main region, then the project links, Open demo and Create a project. Each control had a name and a 2 px amber focus ring. Shift+Tab into the header reached "Dashboard" before "SLEUTH home". Details are in `docs/accessibility.md` under "Walkthrough log".

What Narrator actually says for group 1 is not confirmed yet. No fix was needed. Task 14 stays unticked. The server is still running for groups 2 and 3.

## 2026-11-09 Integrate main (PR #1, `Project.updatedAt`) and finish task 3, Đạt

Backup: `git stash push --include-untracked`, stash `0544b34d9f1976dfd2156eb9ef039e569941d68b` (9 tracked, 64 untracked files). It is kept as `stash@{0}`.

Update: `git merge --ff-only origin/main` took `feat/web-test-tooling` from `f549c1c` to `0232faf` (80 commits). Then `git stash apply` put back the local work. Two files conflicted:
- `docs/kiro-engineering-journal.md`: both sides added entries at the end. Kept the common part once, then all of main's entries, then Đạt's. Only the markers were removed. A check confirmed that every non-blank line of both sides is present.
- `pnpm-lock.yaml`: took HEAD (main) as the base and kept the merged `package.json`, which has main's `eval` and `db:migrate` scripts and our pinned test dev dependencies. Ran `pnpm install --lockfile-only --no-frozen-lockfile` with pnpm 10.12.1 (exit 0), then `pnpm install --frozen-lockfile` (exit 0).

The lock diff against main is +591/-2:
- The root importer now lists the seven dev dependencies with exact specifiers equal to their versions: `@axe-core/playwright` 4.9.1, `@testing-library/dom` 10.4.2, `@testing-library/jest-dom` 6.6.3, `@testing-library/react` 16.3.0, `@testing-library/user-event` 14.6.1, `@vitejs/plugin-react` 6.2.1, `jsdom` 26.1.0.
- About 137 package entries are added, which are their transitive dependencies.
- The two removed lines are the `vitest@5.1.0` resolution key, which now carries `jsdom` as a peer. The vitest version did not change.

For Đăng to review: the lockfile, a shared file. No existing package version changed.

Only the two conflicted files were marked resolved; `git ls-files -u` is empty. The index was then cleared, so nothing is staged. All 64 untracked files from the stash are present and byte-identical. The 6 tracked frontend files match the stash exactly.

Task 3 (requirement 1.2):
- The dashboard row shows "Last change" from `project.updatedAt`, in UTC to the minute, inside a `<time datetime>`.
- The client-side `sortNewestFirst` (by `createdAt`) was removed. The list keeps the API order: the demo first, then the most recent change, as done by `sortProjects` in the fixture store.
- Test data gained the new required `updatedAt`: `api-client.test.ts`, `project-list.test.tsx`, `workspace/test-fixtures.ts`.
- New unit tests: the API order is kept even when a later row changed more recently; "Last change" uses `updatedAt`, not `createdAt`; `formatLastChange` returns "unknown" for a bad value.
- New e2e in `dashboard.spec.ts` against the real fixture API: two copies are made and a checklist is saved on the first. The API then lists the demo first and that copy second, and the page shows exactly the API order, each row's `datetime` equal to `updatedAt` and the matching "Last change" text.

Checks after the last code change (fixture mode, in order):
| Check | Result | Exit |
|---|---|---|
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean | 0 |
| `pnpm test` | 759 passed, 75 skipped | 0 |
| `pnpm test:property` | 112/112 | 0 |
| `pnpm check:contracts` | 14/14, openapi matches | 0 |
| `playwright test --workers=1` | 54/54 (dashboard and open-demo flow included) | 0 |
| `pnpm build` | passed | 0 |

The 75 skipped tests are main's Supabase and Postgres suites, which skip when `TEST_DATABASE_URL` or Supabase keys are not set, plus 8 ffmpeg cases. None is a frontend test.

Task 3 is ticked: 1.1 and 1.3 were already verified, and the open-demo e2e passes.

Still open:
- Task 14 waits for the Narrator walkthrough; only group 1 is done, and only as a keyboard check.
- `deriveSegmentStates` now exists in `packages/domain` on main. Replacing the temporary `features/timeline/state.ts` is left for its own turn.

No server was left running. Nothing was committed or pushed.

## 2026-11-09 Use the domain `deriveSegmentStates` in the frontend (temporary adapter removed), Đạt

The workspace and `buildMarkers` now import `deriveSegmentStates` from `@sleuth/domain`. Both get full script segments, so the domain sees `hash`, and the full evidence candidates, so it sees `segmentHash`.

`features/timeline/state.ts` no longer contains any state rules. It re-exports the domain's `SegmentState` type and keeps only the frontend `STATE_LABELS`. Nothing in `apps/web` works out a state any more.

Tests:
- The adapter's rule tests were removed from `state.test.ts`. `packages/domain/src/segment-state.test.ts` and `segment-state.property.test.ts` cover the rules.
- `state.test.ts` now checks only the labels, plus that every value in the domain's `SEGMENT_STATES` has a label.
- Label and interaction tests (timeline keys, sentence list, Lantern, workspace flow) are unchanged.
- New in `markers.test.tsx`: a `candidate` whose `segmentHash` differs from its line's hash shows as stale, while evidence with a matching hash stays needs_review.

Fixture data changed:
- `workspace/test-fixtures.ts` has `hashOf(segmentId)`, a distinct 64-hex value per segment.
- Segments use it, and `evidence()` sets `segmentHash` to the hash of its own segment, so valid evidence matches.
- `workspace-flow.test.tsx` used a different hash for its segments ("b"x64) than its evidence ("a"x64). Under the domain rule all its evidence would have looked stale. It now uses `hashOf`.
- The only intentional mismatch is the new stale-by-hash case.

The domain rules differ slightly from the old adapter:
- confirmed wins over outside proof;
- needs_outside_proof wins over a fresh candidate;
- evidence with a hash mismatch counts as stale whatever its status.

The UI shows the domain result. The golden demo data gives the same states as before (lines 1 to 3 Cursed Frame, line 5 Needs Outside Proof, lines 4 and 6 Ghost), as the e2e runs below confirm.

Checks (fixture mode, in order):
| Check | Result | Exit |
|---|---|---|
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean | 0 |
| `vitest run apps/web/features` | 195/195 | 0 |
| `playwright test` dashboard, investigation, workspace, review, editors specs `--workers=1` | 28/28 | 0 |
| `pnpm build` | passed | 0 |

The e2e runs cover: open demo from the dashboard; choosing a marker seeks the clock to the evidence start (1.0, 4.0, 11.0, 30.0 s) and fills the Lantern with that evidence; a script edit marks only that line Poltergeist; a stale line's Confirm is refused by the server.

Not re-run this time: the full unit suite, `test:property`, `check:contracts`, and the other e2e specs (a11y, focus, smoke, upload, analysis). No code those depend on changed.

Task 14 stays open. Stash `0544b34` is still kept as the backup. No server was left running. Nothing was committed or pushed.

## 2026-11-09 Final Seal task 6 (client methods and report data hook), Đạt

### API client (`apps/web/lib/api-client.ts`)

New methods. Each uses the existing contract schemas for the request (where there is one) and the response:
- `listReshoots(projectId)`
- `updateReshoot(reshootId, { status })`
- `getCoverage(projectId)` returns `{ coverage, seal | null, blockers }`.
- `sealProject(projectId, { note? })`. Its doc comment says it is a human sign-off, to be called only from a person's explicit action.

`ApiClientError` changes:
- It gained an optional 4th field, `details`, filled from `error.details`. `status`, `code` and `message` are unchanged, so existing callers are unaffected. `name` is now "ApiClientError".
- `details` stays `unknown`. The UI reads seal blockers only through `sealBlockersOf(error)`.
- `sealBlockersOf` returns the blockers only for a 409 `seal_blocked` whose `details` match `{ blockers: SealBlocker[] (at least one) }` from the contract. Any other error, or details that do not match, returns null.

### `useReport(projectId)` (`apps/web/features/report/use-report.ts`)

- Loads project detail, `getCoverage`, findings and reshoots, so it has coverage, seal and blockers. Project detail is included because the report needs the project name and the checklist labels (4.1).
- Status is `loading`, `error`, `not_found` or `done`, and `reload()` loads again.
- A response that breaks the contract becomes an error, not data.
- Answers for an earlier project, from before a reload, or after unmount are dropped. The old project is never shown while a new id loads.
- It is read-only: it only sends GETs and never seals.

### Tests

- `api-client.test.ts`, 16 new tests:
  - each new method's URL, method and body;
  - parsing of the response;
  - refusal of bad input before it is sent;
  - refusal of contract-breaking responses (an unknown blocker, an unknown reshoot status);
  - 409 `seal_blocked` keeping `details.blockers`, with `sealBlockersOf` returning them;
  - `sealBlockersOf` returning null for missing, empty or unknown blockers and for other error codes;
  - `details` undefined while status, code and message stay unchanged on an ordinary error.
- `features/report/use-report.test.tsx`, 8 tests: done with all parts, not_found, error then reload, contract break, late answer after a project change, late answer from before a reload, no write after unmount, and GET-only.

### Checks against the real fixture API

`next start` in fixture mode, on a fresh demo copy:
- `POST /seal` answered 409 `{"error":{"code":"seal_blocked","message":"The project cannot be sealed yet.","details":{"blockers":["undecided_candidates","uncovered_items"]}}}`, the shape the client test uses.
- `GET /coverage` returned the same two blockers.

The server was stopped afterwards.

### Checks after the last change (fixture mode)

| Check | Result | Exit |
|---|---|---|
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean | 0 |
| `vitest run apps/web/lib apps/web/features/report` | 47/47 | 0 |
| `pnpm test` | 770 passed, 75 skipped (main's DB and ffmpeg suites without keys) | 0 |
| `pnpm test:property` | 112/112 | 0 |
| `pnpm check:contracts` | 14/14, openapi matches | 0 |

`test:property` and `check:contracts` ran before the last edit, which only removed an unused test argument for lint.

No API or contract change was needed. Final Seal task 6 is ticked. Task 7 (report page) is not started. Review Workspace task 14 stays open. Stash `0544b34` is kept. Nothing was committed or pushed.

## 2026-11-09 Final Seal task 7 (report page and coverage table), Đạt

Kiro added:
- `app/(workspace)/projects/[id]/report/page.tsx`
- `features/report/report-view.tsx` (`ReportView` and `ReportBody`)
- `features/report/coverage-table.tsx`
- `features/report/labels.ts`
- `features/report/report-view.test.tsx`
- `tests/e2e/report.spec.ts`

The workspace header also got an "Open the Final Seal report" link. Data comes from `useReport` (task 6).

Page layout:
- The seal banner comes first: "Draft: not signed off" when there is no seal, "Sealed" with who and when for an active seal, and "Seal broken: evidence changed after sign-off" with the reason for a broken seal.
- Then the 4.1 order: project name, coverage (totals, proven percent and one row per checklist item), findings, open reshoots, outside proof, and the limits of the checks.
- Each finding shows the spooky label beside the plain label (`FindingBadge`), plus what was found, what was not, and the limits.
- The page shows the states, totals and percentage from `GET /coverage` and works none of them out. A test feeds totals that differ from the rows to prove this.
- Each coverage state has words and its own icon shape: check, hollow circle, diamond, circular arrow, dashed square.
- Reshoots (only open ones) and outside proof are read-only. Updating them is task 8; the seal action and exports are task 9.
- Loading, error with Try again, project not found, and empty states (no checklist, no findings, no open reshoots, no outside proof) are handled.

Wording: `labels.ts` copies the state labels and the four honesty notes from `app/api/_lib/report.ts`, so the page matches the exports. That module imports the db package, so it cannot be used in the browser. For Đăng: moving this wording to contracts would make one source; this is optional and not a blocker.

Checks (fixture mode, in order, after the last code change):
| Check | Result | Exit |
|---|---|---|
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean | 0 |
| `vitest run apps/web/features/report` | 24/24 (16 new report tests and 8 from task 6) | 0 |
| `pnpm test` | 786 passed, 75 skipped (main's DB and ffmpeg suites without keys) | 0 |
| `playwright test` report, workspace, dashboard specs `--workers=1` | 13/13 | 0 |
| `pnpm build` | passed; `/projects/[id]/report` is listed | 0 |

The demo report e2e checks:
- the draft banner;
- one coverage row per API item (5), with the same states as the API;
- the API's percentage;
- every real finding (4), with "Ghost(No visual evidence)" and "Phantom Dialogue(Script line not spoken)";
- the section order;
- the limits text;
- the link from the workspace;
- not found for an unknown project;
- axe: 0 serious or critical issues.

On the production build, at 1280 px and 390 px: 5 rows (4 Needs review, 1 Uncovered), 4 findings, no horizontal overflow. The screenshots are in the session scratch folder.

Not run this time: `test:property`, `check:contracts`, and the other e2e specs. No code they depend on changed.

Final Seal task 7 is ticked; task 8 is not started. Review Workspace task 14 stays open, and stash `0544b34` is kept. A `next start` server was left running on port 3000 for Đạt to check the page. Nothing was committed or pushed.

## 2026-11-09 Final Seal task 8 (reshoots and outside-proof lists), Đạt

Kiro added `features/report/reshoot-list.tsx`, `outside-proof-list.tsx`, `reshoot-list.test.tsx` and `tests/e2e/reshoots.spec.ts`. `report-view.tsx` now uses the two lists. The section is renamed from "Open reshoots" to "Reshoots" because it lists open and done tasks, and the task 7 tests were updated for that.

Reshoots (2.1, 2.2):
- Open tasks come first, then done ones. Each shows the checklist item and the script line the API links it to.
- The section says that marking done only closes the reshoot task, and that the item becomes Proven only when new evidence is found and a person confirms it.
- Mark done appears only when `useReport().canManage` is true, and only on open tasks.

How ownership is decided: the frontend has no current-user id, and there is no "me" endpoint. `canManage` therefore follows the existing read rule:
- The fixture store's `canRead` lets a non-demo project be read only by its owner.
- A loaded non-demo project with an `ownerId` is the viewer's own.
- The demo is read-only.
- The server checks again on `PATCH /reshoots/{id}`, where `writable` refuses the demo.

This is the same rule the workspace already uses. If a shared or read-only non-owner view is added later, the frontend will need the viewer's id. That is a question for Đăng, not a blocker now.

`useReport` gained `updateReshoot`, `updatingReshootId` and `reshootError`:
- One update runs at a time, and every Mark done is locked while it runs.
- On success it reloads reshoots and coverage (with seal and blockers) from the API. The page never changes a coverage state itself.
- On failure it keeps the data and shows the server's text on that reshoot.
- Late answers are dropped.

Outside proof (2.3): each line shows the script line, the proof hint, and either "Marked by a person" or "Proposed by the software only", with `data-acknowledged`.

Checks (fixture mode, in order, after the last code change):
| Check | Result | Exit |
|---|---|---|
| `vitest run apps/web/features/report` | 38/38 | 0 |
| `playwright test reshoots.spec.ts report.spec.ts --workers=1` | 8/8 | 0 |
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean | 0 |
| `pnpm test` | 800 passed, 75 skipped (main's DB and ffmpeg suites without keys) | 0 |
| `pnpm build` | passed | 0 |

The new unit tests cover:
- Mark done shown only to the owner and only on open tasks; none on the demo, with the reason;
- locked while saving, and only one PATCH;
- the server's message on failure, with the data kept;
- reload of reshoots and coverage after success;
- both outside-proof states, and the empty states.

The e2e on a fresh editable copy:
1. Creates a reshoot on "Create a new invoice". Coverage then says `reshoot`.
2. Clicks Mark done. The PATCH returns 200 and the task moves to Done.
3. The item's row goes to `needs_review`, not `proven`.
4. After a page reload the task is still Done, has no Mark done button, and the row is still `needs_review`. The API agrees on both.

Also covered by e2e: a failed update shows the server's text and keeps the task open; the demo report has no Mark done; an outside-proof line becomes "Marked by a person" after a real `needs_outside_proof` review. The task 7 report specs still pass.

The `next start` server left from task 7 was stopped before the e2e run, so the test server used current code. No server is running now.

Not run this time: `test:property`, `check:contracts`, and the other e2e specs. No code they depend on changed.

Final Seal task 8 is ticked; task 9 is not started. Review Workspace task 14 stays open. Stash `0544b34` is kept. No backend, contract or dependency change. Nothing was committed or pushed.

## 2026-11-09 Final Seal task 9 (seal panel, confirmation and exports), Đạt

Kiro added `features/report/seal-panel.tsx`, `seal-confirmation.tsx`, `export-buttons.tsx`, `seal-panel.test.tsx` and `tests/e2e/seal.spec.ts`. It also changed:
- `useReport`: new `seal(note)` returning `SealResult`;
- the report page: the panel and the exports come after the 4.1 sections;
- `styles/tokens.css`: the `.sleuth-seal-stamp` animation, turned off under reduced motion;
- `styles/globals.css`: `@media print` rules;
- the workspace layout header: `print:hidden`.

Seal panel (3.5, 4.3):
- Only the owner of an editable copy sees "Apply the Final Seal" (`canManage`). The demo shows a read-only note and no button.
- While `GET /coverage` reports blockers, the button is disabled. Each blocker has a plain sentence, and the fixable ones link to the workspace.
- With no blockers, the button opens a confirm step: "You are signing that you reviewed these items", an optional note (max 1000, trimmed, sent only when not blank, per `SealProjectRequestSchema`), then Sign and seal or Cancel.
- Both buttons are locked while the request runs, and `useReport` refuses a second request.
- A `409 seal_blocked` closes the confirm step, shows the server's text, and puts the server's blockers into the page data through `sealBlockersOf`, so the list shows what is blocking now.
- Other errors keep the confirm step open with the server's text.
- An active seal hides the button. A broken seal offers it again, subject to the blockers.

Confirmation (4.4):
- The wax seal is shown only after the server returns 201 with the seal.
- A polite live region announces "The Final Seal was applied", "The Final Seal was refused" or "The Final Seal was not applied".
- After success, coverage, seal and blockers are reloaded from `GET /coverage`, and the banner reads the API state.

Broken seal (3.6): after a sentence edit, the banner shows "Seal broken: evidence changed after sign-off" from the server's `seal.status` and `brokenReason`.

Exports (5.4):
- "Download CSV" links to `report.csv`; "Open printable HTML" links to `report.html`. Both are existing endpoints.
- Print calls `window.print()` on the report page.
- The print CSS swaps the tokens to a light palette, hides the fog, the site header, the skip link, the seal panel and the export buttons, stops all animation and transition, keeps table rows, list items and findings from splitting (`break-inside: avoid`), repeats table headers, and sets 15 mm page margins.

Checks (fixture mode, in order, after the last change):
| Check | Result | Exit |
|---|---|---|
| `vitest run apps/web/features/report` | 54/54 | 0 |
| `playwright test seal, report, reshoots specs --workers=1` | 16/16 | 0 |
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean | 0 |
| `pnpm test` | 816 passed, 75 skipped (main's DB and ffmpeg suites without keys) | 0 |
| `pnpm build` | passed | 0 |

The new unit tests:
- `seal-panel.test.tsx`: no button for a non-owner; every blocker in words; the confirm step and the note; Cancel; locked and sent once; the wax seal and announcement only after success; a 409 with new blockers; other errors; no button while sealed; reseal offered after a break; the export links and Print.
- `use-report.test.tsx`: the trimmed note and an empty body for a blank note; a 409 mapped to the server's blockers; other errors mapped to failed; one request at a time.

The seal e2e on fresh editable copies:
1. With blockers, the button is disabled and lists exactly the API's blockers, in the same order.
2. Review everything through the API: confirm the candidates, mark the outside-proof line, ask for a reshoot on the uncovered item. Blockers are then empty.
3. The confirm step shows. The POST returns 201 with the note. The wax seal and the live message appear, and the banner says sealed with the note.
4. A sentence edit through the API makes the reloaded banner "Seal broken: evidence changed after sign-off". The API says `broken`, and the button is disabled by `stale_evidence`.
5. A script change while the confirm step is open gives a 409, no wax seal, and the new blocker list.
6. The demo has no button; its CSV and HTML return 200 with the right content type.
7. Print, for both the HTML export and the report page (Print button stubbed, then print media), at A4 and Letter widths:
   - white background and no running animations;
   - every `tr` set to `break-inside: avoid`, and no horizontal overflow;
   - fog, site header and buttons hidden; the seal banner visible;
   - `page.pdf` produces a PDF in both formats.

The reshoot e2e text lookup was scoped to its section, because the seal panel adds a second read-only note.

Not verified:
- A real printer, and a person looking at the PDF pages. The tests check the computed print styles and that a PDF is produced, not how the pages look. Whether a long table actually avoids splitting rows is decided by Chromium's layout.
- Browsers other than Chromium.
- The wax-seal animation by eye.
- A real sign-in. Fixture mode has a default user, so `401 unauthorized` was tested only with a fake response.
- Axe, keyboard-only use and the wider e2e suite are for task 10.

Final Seal task 9 is ticked; task 10 is not started. Review Workspace task 14 stays open. Stash `0544b34` is kept. No backend, contract or dependency change. No server is running. Nothing was committed or pushed.

## 2026-11-10 Final Seal task 10 (end-to-end and accessibility), Đạt

Kiro added `tests/e2e/final-seal.spec.ts` and extended `docs/accessibility.md` with a Final Seal section and walkthrough steps 17 and 18.

### Frontend fixes the flow needed

1. **No UI path to a reshoot for the Ghost item.** That checklist item has no evidence, so the Lantern has nothing to act on.
   - Added `features/report/request-reshoot.tsx`: "Ask for a reshoot" on uncovered rows of the coverage table, for the owner only, with an inline note.
   - Added `useReport.requestReshoot`, which calls the existing `createReshoot` with `checklistItemId` and reloads reshoots and coverage. It shares the one-at-a-time guard with `updateReshoot`.
2. **Focus was lost when the confirm step opened.** The button unmounted. Focus now moves to the note when the step opens, back to the button on Cancel or a refusal, and to the "Final Seal applied" confirmation (a group with `tabIndex=-1`) after a seal.
   - `components/ui/button.tsx`'s `ButtonProps` gained a `ref` type. React 19 already passed it through.
3. **Axe found one serious issue, `link-in-text-block`.** The "Open the workspace" links inside the blocker sentences were shown by colour only. They are now always underlined.

No backend, contract or dependency change.

### The e2e flow (UI on a fresh copy; the API only read to cross-check)

1. On the demo, "Make an editable copy" opens the copy.
2. Confirm lines 1 to 3 in the Lantern, and mark line 5 "Needs outside proof". The API then has no `candidate` left.
3. "Open the Final Seal report". Exactly one row is uncovered, "Export the invoice as a PDF". Ask for a reshoot with a note; the row becomes `reshoot`.
4. Before signing: "Nothing blocks the Final Seal", the open reshoot is listed, and the outside-proof line shows as marked by a person.
5. Keyboard sign-off:
   - Tab from the skip link reaches "Apply the Final Seal", and Enter puts focus on the note.
   - Type the note, Tab to "Sign and seal", Enter. The POST returns 201 with the note.
   - Focus moves to the confirmation. The polite live region says "The Final Seal was applied. The report is now signed off." The banner is sealed.
6. The API seal is `active`, with the note, 1 open reshoot and 1 outside-proof line in its snapshot. Both are still shown on the page.
7. "Back to the workspace", edit sentence 2 in the script editor, save; the summary says evidence is now out of date.
8. Back on the report: "Seal broken: evidence changed after sign-off"; the API says `broken`.

### Axe (WCAG 2.0/2.1 A and AA) on the copy's report

- 0 serious or critical issues and 0 other violations in all four states: seal button enabled, confirm step open, after the seal, broken seal.
- "Incomplete" color-contrast items: 1 in the confirm step (the note textarea) and 5 with the broken seal (header and top text over the fog).
- Those are the same kinds as the 8 items measured earlier, which all passed. These 6 were not measured one by one.

### Checks (fixture mode, after the last code change, in order)

| Check | Result | Exit |
|---|---|---|
| `playwright test --workers=1` (all 15 specs) | 71 passed, 0 skipped, 0 failed | 0 |
| `pnpm lint` | clean | 0 |
| `pnpm typecheck` | clean | 0 |
| `pnpm test` | 822 passed, 75 skipped | 0 |
| `pnpm test:property` | 112/112 | 0 |
| `pnpm check:contracts` | 14/14, openapi matches | 0 |
| `pnpm build` | passed | 0 |

Why 75 tests were skipped: they are main's suites that need a database or keys, which this machine does not have:
- `TEST_DATABASE_URL` is not set: `rls`, `pg-queue`, `store.write`, `supabase-handler.db`, the change-impact suite, and parts of `supabase/store` and `supabase-handler`;
- Supabase keys are not set: `api.supabase`, `store.upload`, `store.purge`;
- ffmpeg cases are skipped in `ffmpeg.test.ts`.

None of them is a frontend test.

`vitest run apps/web/features/report` passed 60/60. New tests: focus on open, on Cancel, after a seal and after a refusal; `RequestReshoot` success and failure; the reshoot action appears only on uncovered rows and only for the owner.

### Not checked

- What Narrator or NVDA says.
- Whether the live message and the focus move are both read.
- High Contrast mode, browsers other than Chromium, and real printing.
- Requirement 6.1 asks to show who confirmed each item and when. The report page does not show review decisions: `GET /coverage` does not return them; only the exports do. This was not in task 10, and it is a question for Đăng if the page should show them.

Final Seal tasks 1 to 10 are all ticked. Review Workspace task 14 stays open. Stash `0544b34` is kept. No server is running. Nothing was committed or pushed.

## 2026-11-10: PR #20 merged, PR #21 reviewed, Bao's tasks checked

- PR #20 merged (merge commit `7b038e6`) after merging `main` into the branch; the only conflict was this journal and both sides were kept. The upload form (`apps/web/features/upload`) now sends `sizeBytes`, checks type and size in the browser and explains a server 400. Gate: lint, typecheck and build clean; 945 unit tests, 113 property tests, contract check, ghost scan. CI `db` failed once (port 54322 held by the runner) and passed on re-run.
- Live site, part A of `scripts/prod-smoke.ts`: 14 of 14 PASS.
- Review 003 (PR #21): no sign-in screen, so visitors cannot write on the live site; task 14 (screen-reader pass) is open.
- Bao's tasks against code: ea 7 done and unticked, ea 10 nearly done (no cost ceiling), ea 3 not done. Brief 002b written for the speech-only worker mode.

## 2026-11-11: Gemini fallback model (Phạm Quốc Bảo, evidence-analysis 10, brief 002b)

- Why: on 10 November `gemini-3.8-flash` failed 3 of 3 tries on the free tier and `gemini-3.6-flash` worked 3 of 4 (D-4).
- `createGeminiVideoAnalysis` takes `fallbackModel`. When the model still fails after its retries with `server_error`, `timeout` or `unreachable`, the request is sent again to the fallback, and the rest of the job stays on it. A bad key, a rejected request or a full call budget never falls back. Every attempt still takes one call from the job's budget.
- Worker setting `VIDEO_ANALYSIS_FALLBACK_MODEL`, default `gemini-3.6-flash`. Setting it to the same id as `VIDEO_ANALYSIS_MODEL` turns it off. The primary default is unchanged (`gemini-3.8-flash`).
- Tests (recorded responses, no network): switch after three failures and stay switched; no switch on 403, 400 or budget; the final error is the fallback's code and names no model or key. `packages/media/src/providers`: 29 of 29 pass.

## 2026-11-11: retention stop waits for a running purge (Phạm Quốc Bảo, review 001 finding 1)

- `startRetentionTimer().stop()` now returns a promise. It clears the timer and resolves when a purge that is running has ended. `index.ts` awaits it before it closes the retention pool, so shutdown no longer logs a closed-pool `retention_failed`.
- `runOnce()` returns the purge in flight instead of returning at once, so runs still never overlap.
- Tests: stop waits for a held purge; stop resolves at once when idle. `apps/worker/src/retention.test.ts` passes.

## 2026-11-11: ADR 0007 accepted; evidence-analysis 3, 7 and 10 ticked (Phạm Quốc Bảo)

- ADR 0007 amended for D-4 and accepted: free tiers, no card, Đăng owns both accounts. Visitor videos go to Deepgram only; Gemini only for our own clips (speech-only mode from brief 002b still to ship). Models: `nova-3`; `gemini-3.8-flash` with `gemini-3.6-flash` as fallback.
- No dollar ceiling per job, by choice: with no card neither account can bill. The ADR lists the caps that still bound a job (180 s, 60 frames, 3 Deepgram calls, 8 Gemini calls, the daily limit) and says to add a dollar ceiling if a card is ever added.
- Task 7 ticked as it stands. The finding names the general kind of proof. A specific hint per term (`classify().hint`) would change locked golden text, so it was not done.
- Task 10 ticked on PR #18, PR #22 and Đăng's manual run of 10 November (counts only).
- Docs only. No code changed.

## 2026-11-11: `pnpm eval -- --providers real` (Phạm Quốc Bảo, evidence-analysis 13 groundwork)

- New `tests/evaluation/real.ts`: builds the Deepgram and Gemini adapters from the same settings as the worker, and cuts audio and frames with FFmpeg in a temporary folder (2 s spacing, at most 60 frames, over 180 s refused before any call).
- `run.ts`: `evaluate(dir, mode)` takes `{ kind: "mock" }` or `{ kind: "real", providers }`. A clip needs `<name>.mp4` in its folder for a real run, otherwise it is skipped with the reason. The header names providers and models. The run prints how many clips used the Gemini fallback. A missing key stops the run with `provider_not_configured: <setting> is not set`, never the value.
- Tests (no network, no FFmpeg): with fake providers that hear and see what the example's hand-written inputs say, the real path scores exactly like the mock path; the temporary folder is gone after the run; no video means skipped; over 180 s throws before any provider call; header names models, never a key. `tests/evaluation`: 24 of 24 pass.
- Not done: the real run itself. It needs clips 1 to 5 recorded and labelled, and the keys Đăng holds.

## 2026-11-13: anonymous guest sign-in in the browser (Đạt, review 003 blocker, ADR 0006)

Branch `feat/web-anonymous-signin`, in its own worktree from `main` `62e2332`. Nothing was committed or pushed. The accessibility work (PR #26) and the stash were not touched.

What changed (frontend only; no API route, contract, database, RLS, worker or dependency change):
- `apps/web/lib/guest-auth.ts`: the sign-in rules.
  - `ensureSession()` reuses a session the Auth server still accepts. Otherwise it calls `signInAnonymously()`.
  - A new user is made only when there is no session, or when the Auth server answers that the session is gone (401/403, `user_not_found`, ...). A network error never makes a new user.
  - Calls made at the same time share one sign-in.
  - `prepareRequest()` only reads the session, so an expired cookie gets refreshed. It never signs in.
  - Errors are `not_configured`, `anonymous_disabled`, `network` and `failed`. Each has a plain message saying nothing was created. Nothing is logged.
- `apps/web/lib/supabase-browser.ts`: `createBrowserClient` from `@supabase/ssr` (existing 0.12.7), built lazily, only in Supabase mode. The session is kept in the `@supabase/ssr` cookies that `supabase-server.ts` reads (same URL, so the same cookie name).
- `apps/web/lib/auth-config.ts` (server): the mode comes from `SLEUTH_DATA_MODE`, by the same rule as `dataMode()`. It is not guessed from a URL or key being set. Only the two public values are passed on.
- `apps/web/app/(workspace)/layout.tsx`: reads that config per request (`connection()`) and wraps the pages in `GuestAuthProvider`. The pages are now rendered on demand (`ƒ /`).
- `apps/web/components/guest-auth-provider.tsx`: one guest auth and one API client for every page, so both entry points share the session and the in-flight sign-in. `GuestSessionNote` says the session lives in this browser only and cannot be recovered after its data is cleared.
- `apps/web/lib/api-client.ts`: a `beforeRequest` option. In Supabase mode it is `prepareRequest`, and no `x-fixture-user` header is sent. Same-origin calls carry the cookie.
- Dashboard "Create a project" and demo "Make an editable copy":
  1. sign in;
  2. only then send the create request;
  3. while waiting, the button is locked with a ref against double clicks and says "Starting a guest session..." and then "Creating..." / "Making a copy...";
  4. a failed sign-in shows an alert and sends no request, and pressing again retries.
- Viewing pages never signs anyone in. The demo stays read-only.

Checks (fixture mode, on the worktree):

| Check | Result |
|---|---|
| New unit tests: `guest-auth.test.ts` (17), project-list (+5), editors-panel (+5), api-client (+1) | pass |
| `vitest run apps/web/lib apps/web/features` | 327/327 |
| `pnpm test` | 885 passed, 75 skipped (the same DB/key/ffmpeg suites as before) |
| `pnpm lint`, `pnpm typecheck` | clean |
| `pnpm --filter @sleuth/web build` | passed |
| Client bundle (`.next/static`) contains `SUPABASE_SERVICE_ROLE`, `DATABASE_URL` or `service_role` | 0 files |
| `playwright test --workers=1` (all specs) | 71/71 |

One run of the full features set had a single timing failure in `workspace-flow.test.tsx` (the playhead test). It passed 3 of 3 times alone, and in the next full run. It does not touch the new code.

Not verified: a real sign-in. This machine has no Supabase test project. It has no `NEXT_PUBLIC_SUPABASE_*` values and no Supabase CLI. The unit tests use a fake `supabase.auth`, so they do not prove the following:
- a real anonymous user is made;
- the cookie survives a reload;
- the server reads it;
- two users are kept apart.

For Đăng: a test Supabase project with anonymous sign-ins on, and its `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `DATABASE_URL` set locally (not shared in chat). Then run part B of `scripts/prod-smoke.ts`, plus a reload check, against that test project. Not against production.

### 2026-11-13: guest sign-in no longer replaces a session on unclear errors (review fix)

Two cases were reproduced in `guest-auth.ts`:
1. `getSession` returned `session: null` with an `AuthApiError` 429. `ensureSession` still called `signInAnonymously`.
2. With a session, `getUser` returned 403 `access_denied`. The code signed out and made a new guest, because `isDeadSession` treated every 401 or 403 as a dead session.

Fix (`apps/web/lib/guest-auth.ts`, frontend only):
- A failed session read is no longer read as "signed out". Now a new guest is made only in two cases:
  - the read succeeds and there is no session;
  - the Auth server gives a specific dead-session code (`user_not_found`, `session_not_found`, `session_expired`, `bad_jwt`, `refresh_token_not_found`, or `AuthSessionMissingError`).
- HTTP 401 or 403 alone no longer counts as a dead session.
- Rate limits, access denied, other unknown errors and network errors now throw. The person sees "Guest sign-in did not work ... Try again" or the network message. Nothing calls `signOut` or `signInAnonymously`, and no create request is sent.
- Reusing a valid session and sharing one sign-in between concurrent calls are unchanged.

Regression tests. Before the fix, 6 failed, and these were exactly the new tests:
- `guest-auth.test.ts`: `getSession` 429; `getSession` unknown error; `getUser` 403 `access_denied`; `getUser` bare 401. In each, `signInAnonymously` and `signOut` are not called.
- `project-list.test.tsx`: the real `createGuestAuth` with a 429 session read. The test checks for an alert, no POST, no sign-in or sign-out, and that the button can be pressed again.
- `editors-panel.test.tsx`: the real `createGuestAuth` with a `getUser` 403 `access_denied`. The test checks for an alert, no copy, and no sign-in or sign-out.

Also added: `getSession` with `refresh_token_not_found` still starts a new guest. This test passed before the fix and after it.

After the fix:
- `vitest run apps/web/lib apps/web/features`: 335/335;
- `pnpm lint`, `pnpm typecheck` and `git diff --check`: clean.

Still not verified: a real Supabase sign-in, the cookie surviving a reload, and two users kept apart. There is no Supabase test environment on this machine. Nothing was committed or pushed.

### 2026-11-13: live check of guest sign-in on the dev Supabase project

Setup:
- Branch `feat/web-anonymous-signin` at `e8fa7cd`.
- The env is the "sleuth dev" set in `apps/web/.env.local`. It is git-ignored and not tracked, and no values were printed.
- The file has every required name set. But its `SLEUTH_DATA_MODE` is not `supabase`, so the server was started with `SLEUTH_DATA_MODE=supabase` set in the shell.
- `next dev` on `127.0.0.1:3001`, opened as `http://localhost:3001`.
- Supabase mode was confirmed: a POST /projects with no session got 401, and so did one with a forged `x-fixture-user`.
- No migration, seed, worker or AI provider was used.

**Browser, with real cookies.** Playwright Chromium was used with separate contexts for A, B and a visitor. The "Create a project" and "Make an editable copy" requests were renamed on the way out to `zz-test-*`. The cookie and the sign-in were untouched.

Final run: 30 of 30 checks pass.
- Viewing the dashboard, demo and report made 0 `/auth/v1/signup` calls and left no auth cookie. The guest note shows on the demo.
- Create a project made 1 real anonymous sign-in, then the project (201), and set an `sb-*-auth-token` cookie.
- After a reload, A still sees the project. A can open it, and it is editable. A cookie request to GET it returned 200. No new guest was made.
- Make an editable copy gave 201 with the same owner as A, no new guest, and the copy opens editable.
- B double-clicked: 1 sign-in and 1 create POST. B is a different user.
- B cannot reach A's project or copy:
  - GET returns 404 and writing a script returns 404;
  - A's projects are not in B's list;
  - B's page for A's project says not found.
- The visitor cannot read A's project (404) or write it (404). The visitor's list holds only the demo, and the visitor made no guest.
- A still reads its project after B signs in.

The first three runs had failures in the test script, not in the app:
- a response body read too early;
- visibility checks that did not wait;
- the copy's POST body could not be read after the page left.

The script was fixed and the app code was not changed.

**API smoke test** (`scripts/prod-smoke.ts`). Set in the shell only: `PROD_SITE_URL=http://localhost:3001`, plus the dev URL and anon key mapped to `PROD_SUPABASE_URL` and `PROD_SUPABASE_ANON_KEY`.
- Part A: 14 of 14 pass.
- Part B: 17 of 19 pass. Two backend or config points for Đăng:
  1. "signed upload URL issued" expects status 200, but the API answers 201 with an `uploadUrl`. The script and the API disagree; the URL was issued.
  2. "bucket refuses a .txt body": the dev bucket accepted a `text/plain` upload (200). The bucket's allowed MIME types do not seem to be set on dev. The 51 MB upload was refused (400).

Test data made, for cleanup (the API has no delete route; use `docs/deploy-plan.md` section 7):
- 11 projects named `zz-test-*`, from 13:45 to 13:49 UTC:
  - `zz-test-4waug-A-1`;
  - `zz-test-wp25u-A-1`, `-A-2`, `-B-1`;
  - `zz-test-w9ui3-A-1`, `-A-2`, `-B-1`;
  - `zz-test-aglvg-A-1`, `-A-2`, `-B-1`;
  - `zz-test-hgli8c` (smoke).
  - Their ids run from `prj-0mwf14qud0001-eb75deee` to `prj-0mwf19d62000l-f5cc5b6b`.
- About 9 anonymous auth users: 7 from the browser runs and 2 from the smoke test.
- 3 smoke asset versions: `av-0mwf19hj8000n-2959d91c`, `av-0mwf19k1l000p-14c9f07f` and `av-0mwf19msw000s-ea33f596`. The first two have storage objects (4 KB webm, and the accepted .txt).
- Two older rows, `zz-test-e2e-zkgp8m` and `zz-test-e2e-15jv2c` from 11:34 and 11:39 UTC, were not made here.

The live checks ran against the dev project only, not production. No frontend bug was found, so no app code changed in this step. Nothing was committed or pushed.
## 2026-11-11: Narrator walkthrough and the step 18 fix (Review Workspace task 14)

A Narrator walkthrough was run on Windows and Edge, against the production build in fixture mode, at commit `c737231`. An agent pressed the keys. The evidence is screenshots of Narrator's Speech recap. Nobody listened by ear. The step-by-step results are in `docs/accessibility.md` ("Narrator walkthrough log").

Steps 1 to 15 and 17 pass on the transcript. Two findings:

- **Scan mode.** With Narrator Scan mode on, Right reads the marker's label one character at a time instead of moving to the next marker. The walkthrough now says to turn Scan mode off for the timeline (Narrator key + Space). No code change: in Scan mode the screen reader keeps the arrow keys for itself.
- **Step 18 failed.** The disabled seal button was described as "The Final Seal is not available yet What blocks the Final Seal". The button's `aria-describedby` pointed at a wrapper around a list with `aria-label`. To build the description, the browser walks the wrapper, and on reaching the list it uses the list's label instead of its items. Fix in `seal-panel.tsx`: `aria-describedby` now lists the intro line and one `span` per blocker sentence. The links and the list label are no longer part of the description.

Tests added: `seal-panel.test.tsx` checks the exact description; `seal.spec.ts` checks it in Chromium. The new unit test failed before the fix. In jsdom, the old description also included "Open the workspace".

| Check (fixture mode) | Result |
|---|---|
| `vitest run apps/web/features/report` | 61/61 |
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `playwright test seal, final-seal, a11y, report --workers=1` | 22/22 |

Not checked: step 18 heard again after the fix; speech cut off or overlapping (steps 15 and 17); hover contrast; Windows High Contrast mode. Task 14 stays open. Nothing was committed or pushed.

## 2026-11-13: step 18 re-checked with Narrator (Review Workspace task 14)

Đạt checked the step 18 fix with Narrator by ear. On a copy whose seal is still blocked, Narrator read both reasons on the disabled "Apply the Final Seal" button: undecided evidence candidates, and checklist items with no usable evidence. Step 18 is now **Pass**. Source: the user heard it directly. The exact words were not captured, so it is not a verbatim transcript.

Still open, so task 14 stays open:
- Steps 15 and 17: whether speech is cut off or overlaps, checked by ear.
- Hover contrast.
- Windows High Contrast mode.
- Narrator heading navigation with the heading key.

Only docs changed in this entry. Nothing was committed or pushed.

## 2026-11-13: hover contrast, Windows High Contrast, heading navigation (Review Workspace task 14)

An agent ran these checks. Details are in `docs/accessibility.md`.

- **Hover contrast: Pass, nothing changed.** 20 text elements on 18 controls were measured while hovered: dashboard, workspace copy and report copy. The text was made transparent and every pixel of its line box was read as the background. The lowest results are 6.68:1 for large text (the wordmark, needs 3:1) and 7.91:1 for normal text (needs 4.5:1). A first run screenshotted the whole control and counted borders and rounded corners as background, which gave false "1:1" results. That run was thrown away.
- **Windows High Contrast: 2 problems found and fixed.** The Night sky theme was applied through Settings. Before the check, the theme was "None" (flags 126, `Custom.theme`). It was restored afterwards and the values were checked again.
  - Problem 1: the chosen marker and the chosen script line looked like the rest. The theme gives every border the same colour and drops the raised background.
  - Problem 2: the playhead and the marker range bars disappeared, because they were drawn with `background-color`.
  - Fix in `timeline.tsx` and `sentence-list.tsx`: a double border for the chosen item in forced colours, and borders instead of backgrounds for the playhead and bars.
  - Re-checked in the real theme.
  - Note: Playwright Chromium follows the Windows theme only with `forcedColors: null`. Its default emulates "none", and a first run made that way was not counted.
- **Narrator heading navigation: not verified.** The desktop tool lost its handle on Edge's web content between calls, so H and Shift+H were never sent. Narrator's speech also cannot be captured from this session. No PASS is recorded.

| Check (fixture mode) | Result |
|---|---|
| `vitest run apps/web/features` | 256/256 |
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `playwright test a11y, investigation, focus, workspace, review --workers=1` | 37/37 (including the new forced-colors test) |

Still open, so task 14 stays open:
- Steps 15 and 17: whether speech is cut off or overlaps, checked by ear.
- Narrator heading navigation.
- The other contrast themes.

Step 18 stays Pass, as Đạt confirmed. Nothing was committed or pushed.

## 2026-11-13: Narrator heading navigation Pass; step 15 set up for listening

- **Heading navigation: Pass.** Source: Đạt, checking directly with Narrator in Scan mode. H moved to the next heading and read its name correctly. Shift+H went back and read the previous heading correctly. These results are what Đạt heard and reported, not a verbatim transcript.
- **Step 15 set up for listening.**
  - The production build (`ioAWs_mJzgrmDBH_KiX0a`, fixture mode) is running at 127.0.0.1:3000.
  - An editable copy, `proj-5`, was made for Đạt to press "Run analysis" and listen.
  - The workspace does not load an existing job when it opens, so the queued state can only be reached by pressing the button. It was not queued ahead of time.
  - A separate sanity copy (`proj-1`) confirmed through the API that starting an analysis gives `queued` (attempts 0 of 3), and that it is still `queued` 5 s later. In fixture mode the web app has no worker.

Still open, so task 14 stays open: steps 15 and 17, whether speech is cut off or overlaps, checked by ear. Only docs changed. Nothing was committed or pushed.

## 2026-11-13: step 15 heard; step 17 set up (Review Workspace task 14)

- **Step 15 by ear: Pass, within a stated scope.** Đạt listened directly with Narrator on the fixture copy `proj-5`. After pressing "Run analysis" and waiting about 10 s, Đạt heard the queued message read in full, once, with no repeats while it polled. Overlap with other speech was not reported, so it is not recorded as checked.
- **Step 17 set up, not signed.** The fixture copy `proj-9` was made ready to seal through the local API, the same way `seal.spec.ts` does it.
  - The agent confirmed evidence for lines 1 to 3. This is test setup on fixture data, not a real review.
  - Line 5 was marked as needing outside proof.
  - A reshoot was asked for the uncovered item `ck-4`.
  - The coverage API then reported `blockers: []` and no seal. The report page answers 200.
  - The seal was not applied, so Đạt can sign it and listen.

Task 14 stays open until step 17 is heard. Only docs changed. Nothing was committed or pushed.

## 2026-11-13: step 17 heard; Review Workspace task 14 ticked

- **Step 17 by ear: Pass, within a stated scope.** After signing with the keyboard, Đạt heard both messages directly with Narrator: "Final Seal applied." and "The Final Seal was applied. The report is now signed off." These are what Đạt heard and reported, not a verbatim transcript. Their order and any overlap between them were not reported.
  - Three fixture copies were made ready to seal and were all signed: `proj-9`, `proj-18` and `proj-27`.
  - Đạt missed the speech on the first two and they were left as they were.
  - Đạt has not confirmed which copy ID the heard run was on.
- **Task 14 checked against its own criteria** (`.kiro/specs/review-workspace/tasks.md`):

| Criterion | Evidence | Met |
|---|---|---|
| Do: axe scan of dashboard, workspace and lantern | `a11y.spec.ts`: 6 axe tests, with motion on and off. They passed after the last code change (the 37/37 run on 2026-11-13) | Yes |
| Do: reduced-motion test | `a11y.spec.ts` "reduced motion"; `focus.spec.ts` with reduced motion | Yes |
| Do: a Narrator or NVDA walkthrough noted with what was and was not checked | Steps 1 to 18 in `docs/accessibility.md`: Speech recap (2026-11-11) and Đạt by ear (steps 15, 17, 18 and heading navigation, 2026-11-13) | Yes |
| Done when: axe reports no serious or critical issues | 0 serious or critical on every scanned page and state | Yes |
| Done when: the doc lists known gaps honestly | "Known gaps" names the limits: one screen reader and one browser, the scope of the by-ear checks, contrast themes not tried, the 6 unmeasured report nodes, the 8.5 limits, the unwired video player, the open focus decision | Yes |

  Task 14 is ticked. Requirement 8.5 is still only partly proven, and the doc says so. The task did not ask for full proof.

Only docs and the task list changed in this entry. Nothing was committed or pushed in that session.

## 2026-11-13: accessibility follow-up handed off

PR #21 (`feat/web-test-tooling`) was already merged on 2026-11-09. So the follow-up work goes on a new branch, `fix/accessibility-followup`, made from the newest `main` (`62e2332`):
- the step 18 description fix;
- the High Contrast fixes (chosen marker and line, playhead and range bars);
- their tests;
- `docs/accessibility.md`;
- task 14 ticked.

The only conflict was this journal: `main` had new entries. Both sides were kept, with `main`'s entries first.

## 2026-11-13: submission groundwork (brief 005)

- `docs/submission/kiro-usage.md` (DRAFT): steering, specs, hooks, agents, property tests, mutation checks and the review routine, each claim with its journal date, PR or commit. Ends with what only Dat and Phạm Quốc Bảo can add.
- `docs/submission/dogfood-plan.md` (DRAFT): order, dates, people, files, fallback. The official rules page returned HTTP 403 to the page reader, so the video rules are not quoted; Dang reads them.
- `.github/workflows/keep-alive.yml`: one read-only query against sleuth-prod on Mondays and Thursdays at 03:17 UTC, plus manual runs and a run on PRs that change the file. Prints only ok or an error code. `docs/deploy-plan.md` quotes the Supabase pausing rule (7 days of low activity) and GitHub's 60-day rule for scheduled workflows in a public repo.
- `docs/submission/launch-checklist.md` (DRAFT): 15 dated items with owners; most are open.
## 2026-11-13: speech-only worker mode (brief 002b, built by Đăng under D-13)

- `VIDEO_ANALYSIS_PROVIDER=none`: no frame folder, no frame files, no Gemini client and no `VIDEO_ANALYSIS_API_KEY` read; the pipeline runs on the transcript alone. Unset or `mock` in supabase mode is still refused (`provider_not_configured`), so a missing setting never falls back to Gemini.
- `VIDEO_ANALYSIS_PROVIDER=gemini` now sends frames only for a project owned by a real Supabase Auth account (not anonymous, and known to Auth) that is listed in `VIDEO_ANALYSIS_OWNER_IDS`. Empty list means nobody. `loadJobInputs` returns `owner: { userId, realAccount }` read from `auth.users`.
- Engine: `speechOnly` adds "Checked by speech only ..." to every finding's limits and every explanation. The rules are unchanged: a screen claim gets no candidate from speech alone, so its item stays a Ghost; outside-proof lines still get `needs_outside_proof`; nothing is confirmed. Existing fields only, so no contract change.
- Already done by Phạm Quốc Bảo on 11 November, not repeated: Gemini retry and fallback model, ADR 0007 amendment, no per-job dollar ceiling (free tier, no card). ADR 0007 now also states how the data rule is enforced.
- Tests: 10 unit (speech-only.test.ts), 1 property test over owner, list and account kind (60 runs), 3 engine tests, 1 Postgres handler test (VIDEO_ANALYSIS_PROVIDER=none: zero extractFrames calls, zero new frame rows, transcript stored, findings say speech only), 3 Postgres owner tests (anonymous guest, owner unknown to Auth, confirmed email account). Mutation check: with the owner gate removed from the handler, 4 tests failed.
- Four Postgres test files that run one query at a time now open one pool client instead of four (Free pooler cap of 15).
- Local full run: the Postgres suites failed while another session held 13 of the 15 pooler clients on sleuth-dev (pg_stat_activity: 11 idle and 2 active Supavisor sessions, none from this machine). The CI `db` job is the gate for those suites.
## 2026-11-13: first-real-job script (brief 004 step 3)

- New `scripts/prod-e2e.ts`: one anonymous guest runs sign-in, create, a 3-line script, a 2-item checklist, upload of our own clip through the signed URL, analysis (it waits for a worker run started by hand), evidence and finding counts, one review, an edit of one sentence (it picks a line that has evidence), the Final Seal and `report.csv`. Prints PASS, FAIL or SKIP with counts and ids only. A skipped step is reported as not proven. The header holds the read-only queue check for the SQL editor.
- The clip is our own: `scripts/make-check-clip.ps1` regenerated it (6.5 s, 62918 bytes); the 10 November file was gone.
- Rehearsal on sleuth-dev (local web in Supabase mode, one local `pnpm worker -- --once` with Deepgram and gemini-3.6-flash, our clip only): run 1, all 10 steps PASS (evidence 1; findings cursed_frame 1, ghost 1, phantom_dialogue 1; review resolved the cursed_frame; seal blocked by uncovered_items; CSV 32 rows). Run 2, steps 1-6 and 8-10 PASS, step 7 SKIP (the only finding was a Ghost, which has no evidence to review); step 8 staled the 1 evidence item on the edited line and nothing else. Results vary between runs because the providers do.
- The dev worker run also claimed and failed one older queued dev job (it retried, then failed). Not investigated; dev only.
- Not run on production: that needs Dang's shell and the queue check.
## 2026-11-13: guest sign-in check (brief 004 step 1)

- New `scripts/guest-flow-check.ts`: drives Chromium through the real guest flow and prints PASS or FAIL only, plus the one project id it makes. It takes our own clip (`scripts/make-check-clip.ps1`, 6.5 s) so the browser reads a real length; no stub.
- Run against a local dev server on the PR #27 branch (separate worktree, `SLEUTH_DATA_MODE=supabase`, sleuth-dev values loaded in that process only): 14 of 14 PASS. Signed out, create shows "Starting a guest session..." then a project; reload keeps it; a second browser does not see it and gets "Project not found"; a text file is refused with no server call; our clip got 201 and was saved to storage.
- Two first runs failed because of the script, not the app: Next.js keeps an empty role=alert route announcer, and the demo has two links. Both fixed.
- Not covered by the script: review 005 item 4 (anonymous sign-ins switched off); it needs a dashboard toggle.
- Leftovers in sleuth-dev: guest projects from these runs; the 7-day anonymous purge removes them.
## 2026-11-13: playback URL for the owner's player (brief 004 step 2, contract change)

- New `GET /projects/{id}/assets/{assetVersionId}/playback-url` (`getPlaybackUrl`) returns `{ url, expiresAt }` or both null. Null means no playable video: the demo, fixture mode, or a version whose file never reached storage.
- Access follows the read rule: a private project's URL goes to its owner only; another user and a visitor get 404 `not_found`, the same as every other route. An asset of another project or an unknown id is 404.
- Lifetime 600 s (`PLAYBACK_URL_SECONDS`): a browser fetches byte ranges from the same URL while playing and seeking, so it must outlast a review of a 3-minute clip; still short-lived. The worker's download stays at 300 s. The storage client's `createSignedDownloadUrl` takes an optional lifetime, so no other caller changes.
- Tests: 4 contract tests on both stores (one is a property test over owner, other user and visitor against the demo and a private project), 2 route tests, 1 real-storage test on sleuth-dev (no URL before the file lands; after it lands, a URL on the Supabase host with no key, expiring within 600 s, that returns the bytes; 404 for others).
- Gate: lint, typecheck clean; 81 test files and 966 tests passed (none skipped); 113 property tests; `openapi.yaml matches the contracts`; build; ghost scan clean. Golden fixtures unchanged.
## 2026-11-13: smoke test expects 201, deploy plan synced with the production check

- `scripts/prod-smoke.ts` now expects 201 from createUploadUrl (the contract says 201).
- `docs/deploy-plan.md`: bucket step lists all four video types and a verify line; new section 5b records the 13 November production check as reported by Dang (root cause: no bucket in sleuth-prod; 32 of 32 checks passed; run in Dang's shell, not re-run here); cleanup lists the two Storage folders to delete by hand.
- Gate on this branch: see the PR. Part B was not run and no production values were set.
- Gate: lint and typecheck clean; 81 test files, 955 tests passed; build passed. Correction: the shell had the production values from the user settings, so the smoke script ran part B as well as part A (all checks passed) and made one more zz-test- project in sleuth-prod, which needs the cleanup SQL in section 7.

## 2026-11-14: keep-alive ping uses the worker's driver (PR #33)

- The `ping` job failed in seconds with only `error 2` (psql could not connect; its text was hidden). New `scripts/keep-alive.ts` runs the same read-only query through `createDb` from `@sleuth/db` (postgres.js, `prepare: false`, one connection, 20 s limit), the worker's own driver and options. It prints `ok` or `error <category>` (auth, host, timeout, tls, config, other), chosen from the error code or name only.
- Local check of the categories: sleuth-dev URL `ok`; wrong password `error auth`; unknown pooler user `error other`; unknown host `error host`; unroutable address `error timeout`; not a URL `error host`; no variable `error config`.
- The workflow now sets up pnpm and Node 22 and installs like CI, then runs the script. Trigger, schedule, permissions, concurrency group and repository guard are unchanged.
## 2026-11-14: theme foundations for the revamp (Đăng, decisions D-14 to D-18)

- `tokens.css`: theme `hollow` is the default on `:root` (forest black, cream text, amber action, spectral teal, gold), and `:root[data-theme="midnight"]` keeps the first look. `layout.tsx` sets `data-theme="hollow"`; rollback is one line. New tokens: `border-strong`, `gold`, `spectral`, and fog colours per theme. They are mapped in `@theme inline` as `line-strong`, `gold`, `spectral` and `focus`. The print block now also beats `:root[data-theme]`.
- Font: Instrument Serif regular and italic, latin subset, self-hosted with `next/font/local`, SIL OFL 1.1 (licence file beside the fonts). 2 files, 43160 bytes. The system sans is kept. No new dependency.
- Icons: 17 original inline SVG components in `components/icons/` (the five finding types, lantern, film reel, wax seal, play, pause, lock, check, arrow, chevron, close, upload, file). They are decorative by default and get `role=img` with a title. `FINDING_ICONS` maps each finding type.
- Contrast test (`theme-foundations.test.tsx`): 11 pairs per theme, all pass. Hollow ratios: text 14.15, muted 8.16, primary 8.26, on-primary 8.76, warn 9.75, danger 7.67, ok 10.74, spectral 10.86, gold 8.93, strong border 3.66, focus on bg 10.45. Midnight: 15.17, 8.71, 6.71, 7.16, 10.21, 8.03, 10.93, 10.93, 10.64, 4.14, 10.88. None of the proposed values had to change. The same file checks the font budget, the licence, the no-raw-hex rule in components, features and pages, and renders every icon: 63 tests.
- Gate: lint, typecheck and build clean. `tests/e2e/a11y.spec.ts` on Chromium in fixture mode: 10 of 10 passed under hollow. `pnpm test`: 1039 passed, 7 failed, all in `store.write.test.ts`, which this branch does not touch. Supavisor refused new clients (XX000 FATAL) on the shared dev database. That file alone passed 9 of 9. CI `db` runs its own database.
## 2026-11-14: decisions, board and daily update (Đăng)

- `decisions-needed.md`: D-13 decided (PR #34). D-14 to D-18 (UI revamp) decided with Đăng's recommendations. D-10 open with the recommendation that Đăng records clips 1 to 3 by Wed 18 Nov and Bảo labels them. D-12 stays open until #33 merges and its `ping` is green.
- `board.md`: rewritten from `origin/main` `395f490`. Spec ticks 56 of 60. The critical path table now marks steps 1, 2, 4, 5 proven on sleuth-dev only, with the run dates; nothing new is proven on production.
- `updates/2026-11-14-dang.md`: per person, plus the note for Đạt on the demo's no-video panel (it says fixture mode on a Supabase site; the playback URL from #31 is on `main`).
- Leak check on 14 Nov: `scripts/prod-e2e.ts` and `scripts/guest-flow-check.ts` were run against sleuth-dev with all output captured (42 and 15 lines) and searched for every key and connection string in `.env.local`, `token=`, `/storage/v1/object`, `eyJ`, `postgres://` and the clip's spoken words: 0 found. prod-e2e: 9 PASS, 1 SKIP (step 7: the only finding was a Ghost). guest-flow: 14 of 14 PASS.
## 2026-11-14: cleanup list for test data (Đăng)

- New `docs/coordination/cleanup.md`: select-first SQL and Storage click paths for both projects. Production: `zz-test-%` rows, the two 4 KB files in folders `prj-0mwetmijy0001-78237676` and `prj-0mweu1pmk0001-c9e4ae11`, and how to remove the one project each live run of PR #30 or #32 prints. Development: Đạt's 11 `zz-test-*` projects from 13 November, 4 `zz-test-e2e-*` rehearsal projects and the anonymous "Copy of ProofPay demo" projects from PR #30 runs. `docs/deploy-plan.md` section 7 now points to it.
- Found on the way (Đạt's PR #27 journal): the dev bucket accepted a `text/plain` upload, so its MIME list is not set. Added the click path.

## 2026-11-14: prod-e2e team-account mode and speech-only count (Đăng)

- `scripts/prod-e2e.ts`: if `PROD_E2E_EMAIL` and `PROD_E2E_PASSWORD` are both set, it signs in with the Supabase password grant and prints only "signed in as the team account". One of the two alone fails step 1 with a message that names no value. After step 6 it prints "speech-only findings: n of total". The header now shows how to run both modes, with the queue SQL. The script runs only when called directly, so its helpers can be imported.
- `scripts/prod-e2e.test.ts`: 4 tests for option parsing and the count, with no network. The vitest projects do not include `scripts/`, so it runs with `pnpm tsx --test scripts/prod-e2e.test.ts`: 4 of 4 passed. It is not part of `pnpm test`.
- Rehearsal on sleuth-dev as a guest, with a local worker on production settings (gemini, empty owner list): worker `speechOnly=1`, "speech-only findings: 2 of 2", 9 PASS, 1 SKIP (step 7), 0 secrets or transcript strings in the output. In guest mode step 7 is always SKIP and step 8 has no evidence; those two need the team account.
- `docs/deploy-plan.md`: new section 5c, "First real job".

## 2026-11-14 noon: board refresh and the dev database connection check (Đăng)

- Board, decisions and the 14 Nov update now match `main` `bcba5e0`: #29 to #38 merged, CI green, 56 of 60 spec ticks, D-12 decided (keep-alive green on `main`). The earlier guess about an old password in the `DATABASE_URL` secret is removed; the cause of the old `psql` error is unknown and the secret works. Only the browser guest-flow check waits for #27.
- Dev database check (read-only, sleuth-dev, counts only): `max_connections` 60, 3 reserved. At rest: 16 backends, 7 of them client backends (Supavisor 1 active and 1 auth query, PostgREST 1, Storage API 1, postgres_exporter 1, 2 with no name). No Vercel preview or dev server held connections. During one local run of the database test files, Supavisor backends rose from 1 to 23 within 16 s and `store.write.test.ts` failed with XX000 FATAL. So the refusals come from our own test files running in parallel through the session pooler, not from another holder. The same file alone passes 9 of 9. CI runs its own database, so it stays the gate. A local fix, if wanted: run the database files with `--no-file-parallelism`.

## 2026-11-14: script tests run in CI (Đăng)

- `vitest.config.ts` (shared file): the node project now includes `scripts/*.test.ts`. This is the smallest change: `pnpm test` already runs in the CI `check` job, so no workflow edit is needed, and the tests run locally with the same command.
- `scripts/prod-e2e.test.ts` is rewritten from `node:test` to vitest (4 tests, same checks).
- New `scripts/keep-alive.test.ts`: 21 tests for `categoryOf`. 18 codes map to auth, host, timeout, tls, config or other; a TypeError gives config; unknown input gives other. A wrapped `cause` is read one level down, the outer code wins, and a cause that points at itself does not loop. A property test (200 runs) shows the message text never changes the category and the printed line is always one fixed word. Mutation check: with the cause lookup removed, 1 test failed.
- `vitest run scripts`: 2 files, 25 tests passed.
## 2026-11-14: brief 006, UI revamp for Đạt (Đăng)

- `docs/coordination/briefs/006-ui-revamp-for-dat.md`: one PR per screen, in this order: #27 first, then the flaky clock test, tokens in components (strong border on the outline button and inputs, finding icon in `FindingBadge`), dashboard, workspace (coverage bar says "covered", tabs), report (draft, sealed and broken banners; print stays white), and `not-found.tsx` and `error.tsx`. Also the no-video panel copy and the real player on the playback URL. UI freeze Sun 29 Nov. Clips 4 and 5 stay his.
## 2026-11-14: recording kits for clips 1 to 3 (Đăng, decision D-10 recommendation)

- `tests/evaluation/clips/clip-1` to `clip-3`: `RECORDING.md` (one page, 8 or 7 lines to read, 60 to 120 s, English), `demo.ps1` (the on-screen API steps in fixture mode), `finalise.ps1` (fills length, date, hash, link), a draft `clip.json` (recorded fields empty, `labelledBy` null) and `clip.test.ts`.
- Cases: clip-1 is a plain run where a visitor reads the public demo (6 steps, one per checklist item). clip-2 leaves the upload step out on purpose: the line is spoken and the checklist item stays, but `demo.ps1` has no upload call. clip-3 has one security claim, line 5, "All stored videos are encrypted at rest.", with nothing on screen to back it.
- Tests per clip: the harness schema, the script splitting into its own lines, the lines matching `RECORDING.md`, recorded fields all empty or all filled, no `labels.json` before the recording, recorder and labeller being different people, and no secret in `demo.ps1`. Plus one case check each: clip-1 has no outside-proof line and one step per item; clip-2 has no `upload-url` call; clip-3 has exactly line 5 flagged by `needsOutsideProof`. `tests/evaluation`: 5 files, 49 tests passed.
- `demo.ps1 -NoPause` ran all steps of each clip against a fixture `pnpm dev`: clip-1 6 of 6 steps (report.csv 36 rows); clip-2 5 of 5 (job queued); clip-3 6 of 6 (one candidate confirmed, seal refused with 409, report.html 200).
- Not done here: no `labels.json` (Phạm Quốc Bảo labels by watching), ea 11 not ticked, protocol not edited. Found on the way: `clip-5/demo.ps1` calls upload-url without `sizeBytes`, so it now gets 400; it is outside this PR.

## 2026-11-14: WP3, our own evidence clip (Đăng)

- Why the check clip made no evidence: the engine makes a candidate only when a frame shares a key word with the line (or the line needs outside proof). A speech-only run has no frames, so nothing matched. Steps 7 and 8 need frames, so they need the team account and Gemini.
- New: `scripts/make-evidence-clip.ps1` (ffmpeg slides plus Windows text-to-speech, 10.3 s, own footage), `scripts/evidence-clip.json` (the script and checklist prod-e2e uses, plus the on-screen text). Slide 1 shows one key word only, so its evidence is medium and raises a Cursed Frame that step 7 can resolve.
- `scripts/evidence-clip.test.ts`: 4 tests run the clip's expected speech and slide text through the real engine: 3 candidates, a Cursed Frame tied to evidence, no Ghost for item 1, and the same script as prod-e2e. 4 of 4 passed.
- Checked the clip by looking at a frame (text readable) and ffmpeg volumedetect (speech present). Not checked: what Deepgram or Gemini return for it. That is the human step in human-actions.md.
## 2026-11-14: WP0, board and human checklist (Đăng)

- Merged #39 (clip kits), #41 (brief 006), #42 (script tests in CI) and #40 (board) after main sync and green CI. #27 is handled in WP2.
- decisions-needed.md: D-11 decided, freeze moved to 29 Nov (D-19), worker trigger decided (D-20). cleanup.md lists 5 Storage folders to delete by hand. New human-actions.md.
## 2026-11-14: WP1, the worker runs by itself (Đăng, ADR 0009)

- `.github/workflows/worker.yml`: `schedule` on, every 10 minutes. `concurrency` kept (no overlap). `ffmpeg` is installed only when the runner lacks it.
- `analysis-panel.tsx`: a queued job now says "Queued. Analysis starts within about 10 to 15 minutes." The state shown is the real polled state.
- `apps/worker/src/schedule.test.ts`: 4 tests. The schedule and concurrency group exist, the run is `--once`, and an empty queue returns after one claim.
- ADR `docs/decisions/0009-worker-schedule.md` records the limits: GitHub may delay a scheduled run, and it pauses schedules after 60 days of no repository activity.
- Kiro features used: the handover as a spec, steering rules, and the worker-area rules. Checks run: lint, typecheck, test (979 passed, 70 skipped because they need Postgres), test:property (114), check:contracts (14), build, ghost-scan. Nothing failed. The first edit of the workflow failed to match because the comment text differed from what I remembered, so I read the file bytes before editing again.
## 2026-11-14: WP4 part 1, tokens in components, 404 and error pages (Đăng, brief 006 items 2, 3 and 7)

- `workspace-flow.test.tsx`: the shared-clock test waits for the update (`waitFor`). 20 runs in a row: 20 passed.
- Outline button and every text field use `border-line-strong` (3:1 for lines that carry meaning). Decorative lines keep `border-line`.
- `FindingBadge` shows the finding's icon (a different shape per type) beside the spooky and plain names.
- New `app/not-found.tsx` and `app/error.tsx` (retry, link home, never prints the error text). `error-pages.test.tsx`: 7 tests. A Playwright axe check of the 404 page: 11 of 11 in `a11y.spec.ts` passed.

## 2026-11-14: WP4 part 2, the real player (Đăng, brief 006 video section)

- `api-client.getPlaybackUrl` (3 tests), `usePlaybackUrl` (asks again 30 s before `expiresAt`, never more often than every 5 s, null on error, stops on unmount; 6 tests), `useVideoPlayer` (the HTML adapter behind the same state shape as the simulated clock), `PlaybackVideo` (keeps the viewer's place when a fresh URL arrives).
- With a URL the workspace shows the real `<video>` and hides the simulated clock; the timeline, sentence list and Lantern read the same player. With `null` (the demo, fixture mode, a failed request) it keeps the simulated clock. The panel now says 'No playable video file' and no longer claims fixture mode on the live site.
- Not done: captions (we have a transcript, not a WebVTT file). Not run against a real signed URL.
- Found by the full browser run: PR #43 changed the queued text and missed `tests/e2e/analysis.spec.ts`. The browser specs do not run in CI. Fixed here: 3 of 3 passed. The full chromium run: 71 passed, then this one fixed.
## 2026-11-14 afternoon: first real job on production, guest mode (results reported by Đăng)

- `scripts/prod-smoke.ts` parts A and B against the live site: ALL CHECKS PASSED. Test project `zz-test-prpfcc` deleted.
- `scripts/prod-e2e.ts` in guest mode, 04:14 to 04:17 UTC, `main` at `bcba5e0`. The queue check showed only our job. Worker runs 43555627213 and 43555808634 both succeeded (`speechOnly=1`, 2 transcript segments, 0 evidence, 3 findings). The script passed steps 1 to 6, 8, 9 and 10: job succeeded after 1 attempt, 2 Ghost findings, speech-only findings 2 of 2, seal 409 `uncovered_items`, `report.csv` 30 rows. Step 7 was SKIP because speech only gives no candidate to review. Step 8 is weak, because the edited line had no evidence. Both `zz-test-e2e-*` projects were deleted.
- So the first real job is proven on production in speech-only mode, and no frame reached Gemini. Steps 7 and 8 still need the team-account run with a clip that produces evidence (#45).
- `board.md` section 4 and `cleanup.md` are updated: six Storage folders are left to delete by hand.

## 2026-11-14: WP4 part 3, the dashboard (Đăng, brief 006 item 4)

- Eyebrow, display heading with an italic gold line, project cards in two columns, and an icon on each of the five finding cards. The h1 is still exactly 'SLEUTH' (the browser specs look for it).

## 2026-11-14: WP4 part 5, report banners (Đăng, brief 006 item 6)

- The draft, sealed and broken banners each carry an icon (file, wax seal, cross) beside the text. The sealed banner uses the gold border. The wax-seal stamp after sealing (`SealConfirmation`) was already there and is off under reduced motion. 1 new unit test; report unit tests 62 passed; report, final-seal and a11y browser specs 16 passed. Print was not re-checked on paper.
