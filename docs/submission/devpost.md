# Devpost submission text for SLEUTH

Final text for each field, as of 14 November 2026 on `main` at `2c4bc1d`. Numbers come from the commands named beside them. Re-run them on 3 December and replace any that changed. The official rules page returned HTTP 403 to our page reader, so the exact Devpost field names are not confirmed: Đăng pastes them over the headings below on submission day. Items in `[brackets]` are filled in by a person on submission day.

## Name and one-liner

SLEUTH: a QA workspace that checks a software demo video against its script and checklist, and never lets a machine sign off on its own.

Category: Costume Contest. Bonus prizes we aim for: Best Student Project (only after the student check in `docs/coordination/human-actions.md` is done), Bonus Blog, Social Blitz, Best Demo.

Links: live app https://sleuth-eight.vercel.app, repository https://github.com/dngvmnh/sleuth (MIT), video `[YouTube URL]`, blog `[URL]`, social post `[URL]`.

## Inspiration

Demo videos drift from what they claim. A line gets cut, a screen changes, a sentence is edited after recording, and nobody notices until a judge or a customer does. We wanted a tool that treats every claim in a demo as something to prove, and every match it finds as a candidate that a person must confirm.

## What it does

- You give SLEUTH a script (what you mean to say), a video (what happened) and a checklist (what the demo must show).
- It links each script line to moments in the video and reports problems as haunted-studio findings, each with a plain name beside it: Ghost (no visual evidence), Phantom Dialogue (script line not spoken), Cursed Frame (needs a human check), Poltergeist (evidence out of date), Needs Outside Proof (footage cannot prove this).
- Edit one sentence and only the evidence for that sentence goes stale. A cosmetic edit (case, spacing, punctuation) changes nothing.
- A person reviews every candidate. Only a person's decision confirms evidence. The Final Seal records who signed off, on which video and script versions. A later change breaks the seal.
- Try it signed out on the public demo, or sign in as a guest and upload your own video. Visitors' videos get a speech-only check: nothing but the transcript is sent to the AI provider, and no frames are.

## How we built it

- TypeScript monorepo: a Next.js web app and REST API (`apps/web`), a worker (`apps/worker`), shared Zod contracts, pure domain rules and a database layer.
- Two stores behind one interface: an in-memory golden fixture (no keys needed) and Supabase (Postgres, anonymous Auth, private Storage). Both pass the same contract suite.
- Row-level security on every table, tested against a real Postgres in CI (the `db` job).
- The worker runs on a GitHub Actions schedule every 10 minutes (ADR 0009). It is free, and a visitor's job can wait 10 to 15 minutes. The page says so.
- Free tiers only: Vercel Hobby, Supabase Free, Deepgram credit, Gemini free tier.

## How we used Kiro

See `docs/submission/kiro-usage.md`. In short: five specs, nine steering files, three hooks, five custom agents, and property tests written from the specs' `[PBT]` criteria that found three bugs in our own code. We configured MCP servers but left them disabled, and we did not use Powers.

## What is real and what is not

| Part | State | Proof |
|---|---|---|
| API, both stores, change impact, Final Seal rules, reports | Real | `pnpm test`: 1072 passed, 70 skipped (those need Postgres and run in the CI `db` job); CI green on `main` |
| Property tests | Real | `pnpm test:property`: 114 passed |
| Contracts and OpenAPI | Real | `pnpm check:contracts`: 14 passed |
| Production site | Live | `scripts/prod-smoke.ts`: 32 of 32 on 14 November |
| First real job on production | Partly proven | `scripts/prod-e2e.ts` as a guest passed steps 1 to 6, 9 and 10. Step 7 (resolve a finding) was skipped and step 8 passed only weakly, because a speech-only run produces no frame evidence. The team-account run with our own clip is on the human list |
| Transcription and video analysis | Adapters work | One 6-second clip of our own: Deepgram returned 2 segments and 14 words, Gemini `gemini-3.6-flash` returned 3 observations for 3 frames. This shows the keys and adapters work. It says nothing about accuracy |
| Accuracy | Not measured | No real clip is recorded and labelled yet. `docs/evidence-confidence.md` shows only a mock plumbing run on 1 hand-written clip |

## Challenges

- Supabase signed upload URLs live about two hours and cannot be shortened, but our spec says five minutes. We enforce the five-minute rule ourselves when analysis starts.
- Keeping "a person confirms" true everywhere: a repo check flags any new code outside the review rules that sets evidence to confirmed.
- A `.gitignore` rule for `coverage/` hid a route folder named `coverage`. Tests passed on a laptop and failed in CI.
- A free worker means a delay. We chose to say so in the interface instead of faking progress.

## Accomplishments

- Three real bugs found by property tests in code we wrote the same day.
- A public repository whose CI runs the whole database suite on a throwaway Supabase stack.
- A guest flow where a visitor can try the product with no account and no keys.

## What we learned

- Writing the spec first made the rules (candidates, not verdicts) testable instead of a slogan.
- Measuring beats claiming: we publish no accuracy number until real clips are labelled by someone other than the person who recorded them.

## What's next

Record and label five clips, run the evaluation with real providers, and publish the precision, recall and false-warning rate with the clip count. Add captions to the player.

## Built with

TypeScript, Next.js, React, Node.js, Zod, Drizzle ORM, PostgreSQL, Supabase (Auth, Storage), FFmpeg, Deepgram, Gemini, Vitest, fast-check, Playwright, GitHub Actions, Vercel, Kiro.

## Team

Đạt (@phatdat220707), frontend. Đăng (@dngvmnh), backend. Phạm Quốc Bảo (@baofrovn), media and evidence engine.
