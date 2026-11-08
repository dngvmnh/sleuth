---
inclusion: always
---

# Coding standards

- TypeScript `strict` everywhere. No `any`; use `unknown` and narrow.
- Zod at every boundary (request, response, file, env, provider output). Types are inferred from schemas in `packages/contracts`.
- `packages/domain` holds small pure functions. No I/O, no clock, no randomness (pass them in).
- Tests: files named `<unit>.test.ts`; property tests `<unit>.property.test.ts`. Test names read as sentences: `it("does not mark unchanged segments stale")`.
- Error response shape for every API route:

```json
{ "error": { "code": "string_code", "message": "Human readable", "details": {} } }
```

  `details` is optional.
- Timestamps are integer milliseconds from video start.
- Conventional Commits. No secrets, no realistic-looking credentials in code, docs or examples.
