# How we used Kiro

> Final as of 14 November 2026. Every claim below comes from `docs/kiro-engineering-journal.md` (the journal), with the entry date beside it. Numbers are the ones the tests or tools printed on that day. Nothing here is an accuracy number: none exists until evidence-analysis 13 runs on labelled clips.

## Steering

- Nine steering files in `.kiro/steering/`: eight always-on (product, AI safety, architecture, coding standards, frontend, backend, media, team workflow) and one manual (`ghost-hunt.md`). The eight were written before any code (journal, 2026-11-08, Phase 1).
- Review changed them before use. `frontend.md` first listed UI folders because we could not confirm that `fileMatch` excludes paths. After review it matches `apps/web/**`. ADR 0004 replaced "strip all punctuation" with a token rule, so "3.5" and "35" hash differently (journal, 2026-11-08, Phase 1 review).
- `ghost-hunt.md` is a manual steering file (`/ghost-hunt`). Kiro 1.x has no manual hooks, so a steering file took that role (journal, 2026-11-08, Phase 3).

## Specs

- Five specs (`requirements.md`, `design.md`, `tasks.md`) were written against the code that existed after the scaffold, so every design names real files: ingestion (10 tasks), evidence-analysis (16), change-impact (10), review-workspace (14), final-seal (10) (journal, 2026-11-08, Phase 4).
- Each task names an owner, files and a "done when". `tests/kiro-config/specs.test.ts` checks that. It caught two ownership mistakes in our own draft: an ingestion task asked Đăng to edit a frontend folder, and another asked him to edit a worker test (journal, 2026-11-08, Phase 4; commit `30f588e`).
- Tasks were done one at a time from the specs, and ticked only after their checks passed (journal entries from 2026-11-08 onward).

## Hooks

- `.kiro/hooks/` holds three hooks: tests of changed packages on save, a contract check on save, and a journal reminder after a spec task. All call `tools/kiro-hooks/hook.mjs`, plain Node, so they act the same in PowerShell (journal, 2026-11-08, Phase 3).
- What we checked: each hook command ran by hand. A test that failed on purpose made `test domain` exit 1 (journal, 2026-11-08, Phase 3).
- What we did not check then: no hook was seen firing inside the IDE in that session. File-save hooks fire for the agent's own edits, so CI stays the real gate (journal, 2026-11-08, Phase 3).
- `ghost-scan` blocks new code that sets evidence to `confirmed` outside `packages/domain/src/review.ts`. It reads `git diff HEAD`, so it cannot see new untracked files. We scanned those by hand (journal, 2026-11-08, milestones 1 and 2).

## Custom agents

- Five agents in `.kiro/agents/`: `frontend-builder`, `backend-builder`, `media-builder`, `qa-reviewer` and `coordinator`. Each builder may write only its own folders. `qa-reviewer` has no write tool (journal, 2026-11-08, Phase 3). `coordinator` may write only under `docs/coordination/` (its permission rules are in `.kiro/agents/coordinator.md`); it wrote the briefs and reviews listed below.
- The backend, frontend and media work after that ran under these agents and the specs (journal entries by Đăng, Đạt and Phạm Quốc Bảo, 2026-11-08 to 2026-11-13).

## Property tests that found real bugs

Over 200 random histories of edits, cosmetic edits, removals, uploads, re-analyses and reviews, with invariants checked after every step, found three bugs in code written earlier the same day (journal, 2026-11-08, milestones 1 and 2; merged in PR #1):
1. A stale candidate that a person had dismissed could then be confirmed. The fix: `applyReviewDecision` now takes the current line hash and video id. With that argument removed, the property test failed in 4 of 6 runs.
2. A dismissed candidate turned back into "stale" on every later script change, which broke "a cosmetic edit changes nothing".
3. Evidence that went stale a second time did not reopen its resolved Poltergeist.

## Mutation checks: proving the tests can fail

- The store contract suite detects reused segment ids. With `retiredIds` removed, the property test failed in 1 run (journal, 2026-11-08, ingestion 1 to 4).
- Change-impact on the Supabase store: with `resolvePoltergeists` removed, 6 random histories still passed. So we added a direct check, and the mutant then failed with `expected 'open' to be 'resolved'` (journal, 2026-11-09, change-impact 9; PR #3).

## What we had to fix or reject

- **Hidden route:** the `.gitignore` rule `coverage/` hid the route folder `apps/web/app/api/v1/projects/[id]/coverage/`. Tests passed on the laptop and failed in CI. The rule became `/coverage/` (commit `978dc4a`, PR #1).
- **Hidden package:** a `media/` rule hid `packages/media` the same way (commit `e26cd03`).
- **Tool versions:** `pnpm add typescript` pulled TypeScript 7, which typescript-eslint did not support. We pinned 5.9.3 (journal, 2026-11-08, Phase 2).
- **Segment ids:** a removed sentence's id could be reused by a new one. We added `retiredIds` and a test (journal, 2026-11-08, Phase 2).
- **Upload URLs:** Supabase signed upload URLs live 2 hours (measured 7199 s) and cannot be shortened. We did not tick the task. After a team decision (D-1), the five-minute rule is enforced when analysis starts (journal, 2026-11-08 and 2026-11-09, ingestion 7; PR #4).
- **Missing database:** when no database existed, we stopped instead of writing database code we could not run (journal, 2026-11-08, milestones 1 and 2).
- **CI database:** the CI `db` job runs every Postgres, Auth and Storage suite on a throwaway Supabase stack. A missing setting fails the job instead of skipping it. First real run: 61 passed, 0 skipped (journal, 2026-11-09, CI database job; PR #5).

## MCP and Powers: configured, not used

- `.kiro/settings/mcp.json` lists three MCP servers (Supabase read-only, Playwright, GitHub). All three are `disabled: true` with placeholder values (journal, 2026-11-08, Phase 3). We did not use MCP for any result in this project.
- We did not use Kiro Powers.

## Evidence in the repository, not only in prose

- `tests/kiro-config/specs.test.ts` fails when a task cites a missing requirement or lists a file outside its owner's area.
- `tools/kiro-hooks/hook.mjs ghost-scan` blocks new code that sets evidence to `confirmed` outside `packages/domain/src/review.ts`. It passed on `main` at `2c4bc1d`.
- `docs/kiro-engineering-journal.md` has a dated entry for each package of work, with the test numbers that run printed.

## Review and checklist routine

- **Checklist:** every PR from a teammate is checked against `docs/coordination/reviews/README.md`. The checks are both CI jobs, the `contract-change` label, shared files, area ownership, the spec's "done when", ghost-scan, and names and language. Each review is one dated file in `docs/coordination/reviews/`.
- **Briefs:** work is handed out as written briefs in `docs/coordination/briefs/`. Each has "Allowed to change", "Done when" and a report format, and the reports are checked before the next brief starts.

## Only Đạt and Phạm Quốc Bảo can add (in their own words)

- Đạt: how the review workspace and Final Seal UI were built with the frontend agent and spec. Also what the accessibility pass with Narrator and Windows High Contrast found (journal, 2026-11-11 to 2026-11-13).
- Phạm Quốc Bảo: how the media pipeline, alignment and matching, the provider adapters and the evaluation harness were built. Also what failed with real FFmpeg and the provider APIs (journal, 2026-11-09 to 2026-11-11).
- Both: which Kiro features they found most and least useful, and one thing they would do differently.

The three bullets above are for the team to fill in before submission. Nobody has written them yet, and we do not guess for them.

The three bullets above are for the team to fill in before submission. Nobody has written them yet, and we do not guess for them.

The three bullets above are for the team to fill in before submission. Nobody has written them yet, and we do not guess for them.
