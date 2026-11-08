---
inclusion: always
---

# Team workflow

## Ownership

| Area | Owner | Directories |
|---|---|---|
| Frontend and product experience | Đạt (@phatdat220707) | `apps/web/app/(workspace)/`, `apps/web/app/layout.tsx`, `apps/web/components/`, `apps/web/features/`, `apps/web/styles/`, `apps/web/lib/`, `tests/e2e/` (Playwright) |
| Backend, database, revisions | Đăng (@dngvmnh), also scaffold owner | `packages/contracts/`, `packages/domain/`, `packages/db/`, `apps/web/app/api/` |
| Media worker and evidence engine | Phạm Quốc Bảo (@baofrovn) | `apps/worker/`, `packages/media/`, `packages/evidence-engine/`, `tests/evaluation/` |
| Shared files | @dngvmnh plus the owner of the affected area | `fixtures/golden/`, root configs, `pnpm-lock.yaml`, `.github/`, `.kiro/steering/` |

Spec owners: `review-workspace` and `final-seal` are Đạt's. `ingestion` and `change-impact` are Đăng's. `evidence-analysis` is Bảo's.

Nobody edits another area without a review from its owner.

## Rules

- Branches: `feat/<area>-<topic>` (for example `feat/domain-segment-hash`).
- Small pull requests, merged daily. CI green before merge.
- Contract changes need a PR labelled `contract-change` and a passing golden-fixture test.
- One person adds dependencies at a time (lockfile conflicts).
- Everything must run in `fixture` mode without keys.
