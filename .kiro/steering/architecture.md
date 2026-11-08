---
inclusion: always
---

# Architecture

pnpm workspaces monorepo, Node 22 LTS, TypeScript strict.

## Package map

| Path | Role |
|---|---|
| `apps/web` | Next.js App Router, React, Tailwind, shadcn/ui. UI plus REST handlers in `app/api/v1/`. |
| `apps/worker` | Long-running Node process. Claims jobs from Postgres. |
| `packages/contracts` | Zod schemas and inferred types. Only source of truth for shared shapes. |
| `packages/domain` | Pure functions, no I/O: segmentation, hashing, version diff, invalidation, review state. |
| `packages/db` | Drizzle schema, migrations, query functions for Supabase Postgres. |
| `packages/media` | `TranscriptionProvider` and `VideoAnalysisProvider` interfaces plus mocks. |
| `packages/evidence-engine` | Alignment, candidate matching, confidence ranking, explanation text. |

## Dependency direction

- `contracts` and `domain` depend on nothing internal (`domain` may import types from `contracts`; `contracts` imports nothing).
- `db`, `media`, `evidence-engine` may depend on `contracts` and `domain`.
- `apps/*` depend on packages.
- `apps/web` never imports `apps/worker`. Packages never import apps.

## Data modes (`SLEUTH_DATA_MODE`)

- `fixture` (default): web reads the golden fixture in memory; worker reads a fixture job from disk and writes JSON output. No database, keys or Docker.
- `supabase`: real Postgres, Auth and private Storage. Signed URLs with short expiry. Service-role key only on the server and in the worker.

The golden fixture is `fixtures/golden/proofpay-demo/`. A contract test checks that the frontend, the seed script and the worker mock pipeline all agree with it.

## Job queue

Postgres table `processing_jobs`. The worker claims with `SELECT ... FOR UPDATE SKIP LOCKED`, sends a heartbeat, retries up to a limit. No Redis, no Kafka, no microservices. Job processing must be idempotent.
