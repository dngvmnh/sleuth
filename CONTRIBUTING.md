# Contributing

## Who owns what

| Area | Owner |
|---|---|
| Frontend: `apps/web` UI folders, `tests/e2e` | Đạt (@phatdat220707) |
| Backend: `packages/contracts`, `packages/domain`, `packages/db`, `apps/web/app/api` | Đăng (@dngvmnh) |
| Media: `apps/worker`, `packages/media`, `packages/evidence-engine`, `tests/evaluation` | Phạm Quốc Bảo (@baofrovn) |
| Shared: `fixtures/golden`, root configs, `pnpm-lock.yaml`, `.github`, `.kiro/steering` | @dngvmnh plus the owner of the affected area |

`.github/CODEOWNERS` asks for these reviews automatically.

## Flow

1. Branch from `main`: `feat/<area>-<topic>`, for example `feat/domain-segment-hash`.
2. Keep pull requests small. Merge daily.
3. Before you push: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, `pnpm check:contracts`.
4. Open a PR. CI must be green.

## Contract changes

A change to `packages/contracts`, the Drizzle schema or `fixtures/golden` is a contract change.

1. Update the schema.
2. Update `fixtures/golden/build.ts`, run `pnpm tsx fixtures/golden/generate.ts`, and review the JSON diff.
3. Run `pnpm tsx scripts/generate-openapi.ts` and `pnpm db:generate` if they apply.
4. Tick "contract changed" in the PR template and add the `contract-change` label.
5. `pnpm check:contracts` must pass.

## Rules

- TypeScript strict. No `any`. Zod at every boundary.
- `packages/domain` stays pure: no I/O, no clock, no randomness.
- AI output is a candidate. No code path may set evidence to `confirmed` without a human review decision.
- Every spooky label has a plain-English label beside it.
- Never commit secrets or `.env*` files (except `.env.example`). Never log media content or secrets.
- Add dependencies one person at a time to avoid lockfile conflicts. Pin exact versions.
- Commit messages follow Conventional Commits (`feat(domain): ...`).
- Everything must work in `fixture` mode without keys.
