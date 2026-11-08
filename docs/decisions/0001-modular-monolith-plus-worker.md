# 0001 Modular monolith plus worker

## Context
Three students, four weeks. We need parallel work without service sprawl.

## Decision
One pnpm monorepo. `apps/web` holds UI and REST handlers. `apps/worker` is one separate long-running process for media jobs. Shared logic lives in packages with a fixed dependency direction (see `.kiro/steering/architecture.md`). No microservices.

## Consequences
- One repo, one CI, one deploy for the web app; one container for the worker (needs FFmpeg).
- Package boundaries are enforced by review and lint, not by network boundaries.
- If a package grows too large, it can be split later without changing contracts.
