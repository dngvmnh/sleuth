## What changed

<!-- One or two sentences. Link the spec task, for example ".kiro/specs/ingestion task 3". -->

## How it was checked

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test` and `pnpm test:property`
- [ ] `pnpm check:contracts`
- [ ] Works in `fixture` mode with no keys

## Contract changed?

- [ ] Yes: I changed `packages/contracts`, the Drizzle schema or `fixtures/golden`, regenerated the fixture and OpenAPI file, and added the `contract-change` label.
- [ ] No

## AI safety

- [ ] No path sets evidence to `confirmed` without a human review decision.
- [ ] Every new warning says what was found, what was not found, and the limits of the check.
- [ ] No secrets, media content or transcripts are logged.
