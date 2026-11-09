# Reviews

One file per review, named `NNN-short-name.md`. Each records: what was checked, the commands or sources used, what was verified, what was not, and the verdict.

## Log
- 9 November 2026, afternoon: review 001, the worker side of the retention purge (ADR 0008), by Phạm Quốc Bảo. Approved; two low follow-ups. See `001-retention-purge-worker.md`.
- 9 November 2026, evening: no open PRs from Đạt or Bảo, and no branches from them on the remote (`gh pr list --state open`, `git fetch --prune`). Nothing to review yet.

## What Đăng checks on every PR from Đạt or Bảo
1. CI: both `check` and `db` jobs green.
2. Contract change: any edit to `packages/contracts/`, `packages/db/src/schema.ts`, `packages/db/migrations/`, `docs/api/openapi.yaml` or `fixtures/golden/` needs the `contract-change` label and a passing `pnpm check:contracts`.
3. Shared files (`fixtures/golden/`, root configs, `pnpm-lock.yaml`, `.github/`, `.kiro/steering/`, `supabase/`): need Đăng plus the affected area's owner. Lockfile changes: one person at a time.
4. Area: files stay inside the author's area (`docs/team-plan.md` section 2), or the area owner reviews.
5. Spec: the ticked task's "done when" is really met, and the journal has an entry with real numbers.
6. Safety: no secrets, no `.env` files, no new code outside `packages/domain/src/review.ts` that sets evidence to `confirmed` (`node tools/kiro-hooks/hook.mjs ghost-scan`), logs hold ids and counts only.
7. Language and names: English everywhere; real names (Đạt, Đăng, Phạm Quốc Bảo); no AI mentions or trailers.
