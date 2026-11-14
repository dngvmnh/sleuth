# Review 005: PR #27, anonymous guest sign-in for create and copy (Đạt)

Date: 13 November 2026. Reviewer: Đăng. Before merge.
Checked: the PR file list and body, and these files in full at `origin/feat/web-anonymous-signin`: `lib/guest-auth.ts`, `lib/supabase-browser.ts`, `lib/auth-config.ts`, `components/guest-auth-provider.tsx`, the diffs of the workspace layout, `editors-panel.tsx`, `use-dashboard.ts`, `project-list.tsx`, `use-report.ts`, `use-project.ts` and `api-client.ts`. I did not read the test files line by line, and I ran nothing (the builder session was working). CI is green: `check` and `db`. A merge-tree test against #26 shows one conflict, in `docs/kiro-engineering-journal.md`.

## Verdict

Approve the code. Do not merge until one real-Supabase check passes (below, about 10 minutes). The PR says the same: its unit tests use a fake `supabase.auth`, so they cannot prove cookies or real sign-in.

## Does it close the gap from review 003?

| Review 003 asked for | In #27 |
|---|---|
| 1. Add `@supabase/ssr` and `supabase-js` to `apps/web` | Already in `apps/web/package.json` on `main` (0.12.7 and 2.119.0). The PR touches no package file and no lockfile. |
| 2. A browser client from the two public values | Yes. `supabase-browser.ts`, built on first use. Only the URL and the anon key reach the browser, and only when `SLEUTH_DATA_MODE` is `supabase` on the server. |
| 3. `signInAnonymously()` once, session in the `@supabase/ssr` cookie, a clear message if anonymous sign-ins are off | Yes in code, for "Create a project" and "Make an editable copy". Message `anonymous_disabled` exists. **Not proven on real Supabase.** |
| 4. Fixture mode keeps `x-fixture-user` | Yes. Fixture mode never builds a Supabase client. |
| 5. Tests: one sign-in, a failed sign-in shows an alert and creates nothing | Yes per the PR (guest-auth 289 lines, dashboard and editors-panel tests). |

So the gap closes in code. It is open on the live site until the check below passes and #27 is deployed.

## What is good

- A failed or rate-limited read is no longer taken as "signed out". Only named dead-session codes start a new guest, so a 429 cannot spawn orphan users.
- Double clicks share one in-flight sign-in (one user, one project).
- The mode is read from `SLEUTH_DATA_MODE` per request (`connection()` in the layout), not from build time, and having a URL or key set never switches the mode.
- No server-only name appears in the client files (searched `SERVICE_ROLE`, `DATABASE_URL`, `process.env` in `guest-auth.ts`, `supabase-browser.ts` and `guest-auth-provider.tsx`: none; `auth-config.ts` is server-only).
- The guest note is honest: a cleared browser loses the session and its projects.

## Review checklist

| # | Check | Result |
|---|---|---|
| 1 | CI | `check` and `db` green. |
| 2 | `contract-change` | Not needed. No contract, schema, migration, `openapi.yaml` or golden file. |
| 3 | Shared files | None, except the journal (+72 lines). |
| 4 | Area | `apps/web/` only. |
| 5 | Spec | No task is ticked. It implements review 003's follow-up and ADR 0006. |
| 6 | Safety | No secret. Nothing sets evidence to `confirmed`. Ghost scan not run by me. |
| 7 | Language and names | English. Names correct. |

## Conditions before merge

1. **Real-Supabase check (Đăng, or brief 004 step 1).** Needs a Supabase project with anonymous sign-ins on (`sleuth-dev`, not production). In a separate worktree of the PR branch, with `SLEUTH_DATA_MODE=supabase` and the dev values set in that shell only:
   1. Open the dashboard signed out. Press "Create a project". It must say "Starting a guest session...", then create a project.
   2. Reload. The project must still be listed (the cookie reached the server).
   3. Open a private window. It must not see that project.
   4. Turn anonymous sign-ins off in the dashboard, press the button in a fresh private window, and read the message. It must say nothing was created. Turn them back on.
   5. Upload a few KB test file in the new project. It must be accepted; a text file must be refused.
2. **Merge `main` into the branch** after #26 is merged. Keep both sides of the journal. Re-run the end-to-end specs on the final commit. The PR body says the unit run (885) and the browser run (71 of 71) came before the last auth fix.
3. **After deploy,** run `scripts/prod-smoke.ts` parts A and B on production and the guest-flow check from brief 004.

## Notes, not blockers

- `connection()` makes the whole workspace layout render per request instead of at build time. That is fine for this app.
- `prepareRequest` reads the session before every API call, even for visitors who never signed in. It is cheap. It can trigger a token refresh when an old cookie is present.
- A visitor who clears cookies loses their projects. The note says so.
- After this merges, the page legitimately contains the Supabase Project URL and the anon key (both public by design, ADR 0006). The row "No secret in the page or its JS" in `docs/deploy-plan.md` section 5 must say that these two are expected, and still forbid `service_role`, `sb_secret_`, `postgres://` and any provider key. Brief 003 and 004 carry this.

## Follow-ups

| Who | What |
|---|---|
| Đạt | Merge #26 first, then merge `main` into #27, re-run the browser specs, and merge once the check passes. |
| Đăng | Run the real-Supabase check. Then the production checks above. |
