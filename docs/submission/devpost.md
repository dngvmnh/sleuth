# DRAFT: Devpost submission for SLEUTH

> DRAFT. Not submitted. Every number below was printed by a test run named next to it, on `main` as of 9 November 2026. Replace them with fresh runs before submitting. Sections marked TODO depend on work that is not built yet.

## Name and one-liner
SLEUTH: a QA workspace that checks a software demo video against its script and checklist, and never lets a machine sign off on its own.

Category: Costume Contest (per our README; confirm against the official categories before submitting).

## Inspiration
Demo videos drift from what they claim. A line gets cut, a screen changes, a sentence is edited after recording, and nobody notices until a judge or a customer does. We wanted a tool that treats every claim in a demo as something to prove, and treats every match it finds as a candidate that a person must confirm.

## What it does
- You give SLEUTH a script (what you meant to say), a video (what happened) and a checklist (what the demo must show).
- It builds candidate evidence that links each script line to moments in the video, and flags problems as haunted-studio findings: Ghost (no visual evidence), Phantom Dialogue (a script line not spoken), Cursed Frame (needs a human check), Poltergeist (evidence out of date after an edit), Needs Outside Proof (footage cannot prove the claim).
- Edit one sentence and only the evidence for that sentence goes stale. A cosmetic edit (case, spacing, punctuation) changes nothing.
- A person reviews every candidate. Only a person's decision confirms evidence, and the Final Seal records who signed off on which video and script versions. Any later change breaks the seal.

## How we built it
- TypeScript monorepo: Next.js web app and API (`apps/web`), a worker for media jobs (`apps/worker`), shared contracts (Zod), pure domain rules, and a database layer.
- Two data modes behind one store interface: an in-memory golden fixture (no keys needed) and Supabase (Postgres, Auth with anonymous sign-in, private Storage). Both stores run the same contract test suite, so they cannot drift.
- Row-level security on every table, proven against a real Postgres in CI, not only in our own code.

## How we used Kiro
- Specs: five feature specs (`ingestion`, `change-impact`, `final-seal`, `review-workspace`, `evidence-analysis`), each with requirements, design and tasks. Every task names an owner, files and a "done when". A repo test fails if a task cites a requirement that does not exist or lists a file outside its owner's area.
- Steering: nine steering files (architecture, backend, frontend, media, coding standards, AI safety, product, team workflow, and a manual "ghost hunt" review).
- Hooks: three agent hooks (package tests on save, contract checks on save, a check after each spec task).
- Custom agents: backend, frontend and media builders, a QA reviewer and a coordinator.
- Property tests written from the spec's `[PBT]` criteria found real bugs in our own earlier code: evidence a person had dismissed could later be confirmed on an outdated line; a dismissed candidate re-opened on every later edit; evidence going stale a second time did not reopen its Poltergeist. All three are fixed and covered.
- TODO: a short screen capture of a spec task running, and one hook firing.

## What is real and what is mocked (as of 10 November 2026)

| Part | State |
|---|---|
| Backend API, both stores, change impact, Final Seal rules, reports (CSV, HTML) | Real, tested |
| Supabase store, sign-in, row-level security, signed uploads, retention purge | Real, tested in CI against a throwaway Supabase stack |
| Transcription and video analysis | Deepgram and Gemini adapters exist with recorded-response tests (PR #18). Run once on a 6-second clip we made ourselves (synthetic speech over a plain screen): Deepgram returned 2 segments and 14 words, and Gemini `gemini-3.6-flash` returned 3 observations and 6 text items for 3 frames. This proves the keys and adapters work. It says nothing about accuracy. `gemini-3.8-flash` failed 3 of 3 tries on the free tier. No video of a real product has been analysed yet. |
| Evidence matching | Script alignment and matching are built (evidence-analysis 5, 6). Not measured on real clips yet. |
| Review workspace and Final Seal UI | NOT BUILT yet (one placeholder page). |
| Worker in Supabase mode | Built and tested (evidence-analysis 12, 16). |
| Deployment | Not deployed. Plan in `docs/deploy-plan.md`. |

Update this table before submitting. Do not claim a part is real unless it is.

## Numbers we can quote (with their source)

| Number | Printed by |
|---|---|
| 532 unit tests passed | `pnpm test`, local run on `main`, 10 November 2026 (with the shared dev database) |
| 92 property tests passed | `pnpm test:property`, same day |
| 14 contract tests passed; OpenAPI matches the contracts | `pnpm check:contracts`, same day |
| 66 Postgres, Auth and Storage tests passed, 0 skipped | CI `db` job, run 42580335599 (9 November 2026; not re-counted since) |
| Deepgram 2 segments and 14 words; Gemini 3 observations and 6 text items, on one 6 s own clip | `pnpm tsx scripts/provider-check.ts`, 10 November 2026 |

No accuracy, precision or recall numbers yet: the evaluation harness (evidence-analysis 9) and our recorded clips do not exist yet. Quote only numbers `pnpm eval` prints, with the clip count and provider named.

## Challenges
- Supabase signed upload URLs live about two hours and cannot be shortened, but our spec says five minutes. We enforce the five-minute window ourselves when analysis starts.
- Keeping "a person confirms" true everywhere: a check in the repo flags any new code outside the review rules that sets evidence to confirmed.

## What's next
TODO after the build: real providers, the review workspace, the first evaluation run on our own clips.

## Built with
TypeScript, Next.js, React, Node.js, Zod, Drizzle ORM, PostgreSQL, Supabase (Auth, Storage), FFmpeg, Vitest, fast-check, Playwright, GitHub Actions, Kiro.

## Team
Đạt (@phatdat220707), frontend. Đăng (@dngvmnh), backend. Phạm Quốc Bảo (@baofrovn), media and evidence engine.
