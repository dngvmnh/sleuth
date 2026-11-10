# Review 003: PR #21, review workspace and Final Seal UI (Đạt)

Date: 10 November 2026. Reviewer: Đăng. Done after the merge (PR #21 merged as `a50dde8`; it had CI green and one review, no labels).
Checked at `main` `7b038e6` with the changed file list, the code, `docs/accessibility.md` and the full gate.

## Verdict

Approved after the fact, with one blocker for launch (no sign-in) and one task still open (a11y manual pass).

## Checks

| Check | Result |
|---|---|
| CI on the PR | `check` and `db` green. |
| `contract-change` label | Not needed. The PR touches no file in `packages/contracts/`, the schema, migrations, `openapi.yaml` or `fixtures/golden/`. |
| Shared files | `package.json` and `pnpm-lock.yaml` changed (7 new dev dependencies: `@axe-core/playwright`, Testing Library, `@vitejs/plugin-react`, `jsdom`). These need a review from Đăng; this note is that review. Versions are pinned. Install with `--frozen-lockfile` works. |
| Area | All source files are in `apps/web/` and `tests/e2e/`, Đạt's area. Task files for review-workspace and final-seal are Đạt's. |
| Ghost scan | `node tools/kiro-hooks/hook.mjs ghost-scan` is clean. Evidence is confirmed only through the API client's review call. |
| Full gate on `main` after PR #20 | lint, typecheck, build clean; 945 unit tests and 113 property tests pass. |

## Contract use

- `apps/web/lib/api-client.ts` parses every response with the contract schemas, so contract drift fails loudly. Good.
- It sends only `x-fixture-user`. It never sends a session token. In fixture mode that is right. In Supabase mode the API trusts a Supabase session (cookie or `Authorization: Bearer`), so the client cannot act as a user there.
- Upload: `upload-flow.tsx` did not send `sizeBytes`, so after PR #20 every upload would get a 400. PR #20 fixed it: the form now sends `sizeBytes`, checks type and size in the browser, and shows a clear message on a server 400 (too big, type not allowed, too long). Tests cover both. `api-client.test.ts` was updated for the new field.
- Task ticks: review-workspace 13/14 and final-seal 10/10 match the code that is on `main`. Task 14 is correctly open.

## Missing sign-in screen (blocker for "Try your own video")

Checked by searching `apps/web` for `signInAnonymously`, `createBrowserClient` and `NEXT_PUBLIC_SUPABASE`. The only hits are tests and the server side (`supabase-server.ts`, `data-source.ts`). There is no browser Supabase client and no sign-in step in the UI. Result in Supabase mode: a visitor stays signed out, can read the demo, and every write returns 401 or 403. No visitor can upload or create a project on the live site.

What is needed (Đạt, small task, before launch):
1. Add `@supabase/ssr` and `@supabase/supabase-js` to `apps/web` (Đăng reviews the lockfile; one person at a time).
2. A browser client built from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both public by design).
3. On "Try your own video" or "Make an editable copy": call `auth.signInAnonymously()` once, keep the session in the `@supabase/ssr` cookie so the server routes see it, and show a clear message if anonymous sign-ins are off.
4. Fixture mode keeps `x-fixture-user` and needs no sign-in.
5. Tests: sign-in is called once; a failed sign-in shows an alert and no project is created.

Backend side is ready: the server reads the `@supabase/ssr` cookie and a Bearer token, forged headers get 401 (`api.supabase.test.ts`, run against a real database in CI).

## Accessibility gaps

From `docs/accessibility.md` and `tests/e2e/a11y.spec.ts` (Đạt's own results; I did not re-run the browser tests):
- Automated axe run: 9/9 passed, 0 serious or critical. Eight "needs review" colour-contrast items were measured by hand and all pass AA (lowest 6.64:1).
- Open: the manual screen-reader walkthrough is not done. Task 14 correctly stays unticked. Automated checks cannot prove WCAG conformance.
- Not measured: hover and focus colours, Windows High Contrast, other viewport sizes, the native file picker button.
- New since this review: the upload form has new alert messages. They use `role="alert"` and plain text, but the screen-reader pass should include them.

## What breaks with PR #20

Only the upload form, and PR #20 already fixed it. The other callers were checked by typecheck (it fails on a missing `sizeBytes`) and by the web tests (945 pass).

## Follow-ups

| Who | What |
|---|---|
| Đạt | Sign-in task above. Then the manual screen-reader pass (task 14). |
| Đạt | Look at the PR #20 changes to `apps/web/features/upload/` and say if the wording should change. |
| Đăng | Run part B of `scripts/prod-smoke.ts` after Đạt's sign-in is live, to prove the browser flow end to end. |
