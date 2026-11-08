# 0003 Three data modes and the golden fixture

## Context
If the frontend waits for the backend, and the backend waits for the worker, three people block each other.

## Decision
`SLEUTH_DATA_MODE` selects the source. `fixture` (default) reads `fixtures/golden/proofpay-demo/` in memory with no database, keys or Docker. `supabase` uses the real database and storage. The worker has the same switch.

The golden fixture holds a script, checklist, transcript, frame observations, the expected evidence graph and the expected findings, all valid against the Zod schemas. A contract test in CI checks that the frontend, the database seed and the worker mock pipeline all agree with it.

## Consequences
- `pnpm install && pnpm dev` works on a fresh Windows machine.
- Changing a contract means updating the fixture; the test tells everyone.
- The fixture can drift from reality, so it must be extended when real behaviour is found.
