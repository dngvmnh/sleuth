---
inclusion: fileMatch
fileMatchPattern: ["packages/db/**", "packages/domain/**", "apps/web/app/api/**"]
---

# Backend rules

- Versioning: scripts and assets are immutable versions. A change creates a new version; it never edits an old one.
- Invalidation: segment hash is over normalised text (lower case, collapsed whitespace, punctuation stripped). Hash changes mark only that segment's evidence `stale`. A new asset version marks all evidence on the old version `stale`. See ADR 0004.
- Authorisation on every route: check the user owns the project, or the project is the public demo (read-only). Never trust a project ID from the client alone.
- Validate request and response with Zod from `packages/contracts`. Errors use `{ error: { code, message, details? } }`.
- Migrations only through Drizzle. Never hand-edit a generated migration after merge.
- Row Level Security on every table. Service-role key is server and worker only.
- Evidence never becomes `confirmed` without a human `ReviewDecision` (see `ai-safety.md`).
- Processing limits per user and per day are enforced server-side.
