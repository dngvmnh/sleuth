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
