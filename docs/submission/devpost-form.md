# Devpost form, field by field

Paste-ready answers for the Kiroween 2026 submission form (submission 1284091), in the order the form asks. Written 14 November 2026 from `devpost.md`, `kiro-usage.md` and the live site. Items in `[brackets]` are filled in by a person on submission day. Personal data (LinkedIn, student e-mails) never goes in this file.

## Project overview

**Project name** (60 characters max):

```
SLEUTH: The Haunted Cut
```

**Elevator pitch** (200 characters max, this is 164):

```
A haunted QA workspace that checks a demo video against its script and checklist. Every match is a candidate; only a person can confirm it and apply the Final Seal.
```

**Thumbnail** (3:2, 5 MB max): `docs/submission/media/00-thumbnail.jpg` (1500x1000, 176 KB).

## Project story

**About the project** (Markdown). Paste everything inside the fence:

````markdown
## Inspiration

Demo videos drift from what they claim. A line gets cut, a screen changes, a sentence is edited after recording, and nobody notices until a judge or a customer does. We wanted a tool that treats every claim in a demo as something to prove, and every match it finds as a candidate that a person must confirm.

## What it does

- You give SLEUTH a **script** (what you mean to say), a **video** (what happened) and a **checklist** (what the demo must show).
- It links each script line to moments in the video and reports problems as haunted-studio findings, each with its plain name beside it: **Ghost** (no visual evidence), **Phantom Dialogue** (script line not spoken), **Cursed Frame** (needs a human check), **Poltergeist** (evidence out of date), **Needs Outside Proof** (footage cannot prove this).
- Edit one sentence and only the evidence for that sentence goes stale. A cosmetic edit (case, spacing, punctuation) changes nothing.
- A person reviews every candidate. Only a person's decision confirms evidence. **The Final Seal** records who signed off, on which video and script versions, and a later change breaks the seal.
- Try it signed out on the public demo, or as a guest with your own video. Visitors' videos get a speech-only check: only the transcript goes to the AI provider, never frames.

## How we built it

- TypeScript monorepo: a Next.js web app and REST API, a worker with FFmpeg, shared Zod contracts, pure domain rules and a database layer.
- Two stores behind one interface: an in-memory fixture (no keys needed) and Supabase (Postgres, anonymous Auth, private Storage). Both pass the same contract suite.
- Row-level security on every table, tested against a real Postgres in CI.
- The worker runs from GitHub Actions. It is free, so a visitor's job can wait several minutes, and the page says so instead of faking progress.
- The haunted-house interface is original SVG and CSS. The optional "Night wind" is generated in the browser with the Web Audio API: no audio files, off by default, quiet while a video plays.
- Free tiers only: Vercel Hobby, Supabase Free, Deepgram credit, Gemini free tier.

## How we used Kiro

Five specs (requirements, design, tasks), nine steering files, three hooks and five custom agents, all in `.kiro/`. Property tests written from the specs' `[PBT]` criteria found three bugs in code we had written the same day. Details: `docs/submission/kiro-usage.md`.

## Challenges

- Supabase signed upload URLs live about two hours and cannot be shortened, but our spec says five minutes, so we enforce the five-minute rule when analysis starts.
- Keeping "only a person confirms" true everywhere: a repo check blocks any new code outside the review rules that sets evidence to confirmed.
- A `.gitignore` rule for `coverage/` hid a route folder named `coverage`. Tests passed on a laptop and failed in CI.
- A free worker means a wait. We chose to say so in the interface.

## Accomplishments

- Three real bugs found by property tests in our own code.
- A public repository whose CI runs the whole database suite on a throwaway Supabase stack.
- A guest flow where anyone can try the product with no account and no keys.

## What we learned

- Writing the spec first made the rule "candidates, not verdicts" testable instead of a slogan.
- Measuring beats claiming. We have not measured accuracy, so we publish no accuracy number.

## What's next

Label our recorded clips, run the evaluation harness with real providers, and publish precision, recall and the false-warning rate with the clip count. Add captions to the player.
````

**Built with** (25 tags max, these are 18):

```
typescript, nextjs, react, node.js, web-audio-api, zod, drizzle-orm, postgresql, supabase, ffmpeg, deepgram, gemini, vitest, fast-check, playwright, github-actions, vercel, kiro
```

**"Try it out" links:**

- https://sleuth-eight.vercel.app
- https://github.com/dngvmnh/sleuth

## Project media

**Image gallery** (3:2, 5 MB max each, all 1500x1000 JPG from the live site's screenshots in `docs/submission/screenshots/production/`). Upload in this order; the caption is the text Devpost lets you add per image:

| File in `docs/submission/media/` | Caption |
|---|---|
| `00-thumbnail.jpg` | SLEUTH: the cut is haunted. Every match is a candidate; only a person confirms it. |
| `01-dashboard.jpg` | Dashboard on the live site: real coverage of the public demo (a saved sample run) and the findings waiting for a person. |
| `02-claims-map-lantern.jpg` | Claims map and the Evidence Lantern: what was found, what was not, the limits of the check, and the review buttons. |
| `03-findings-cabinet.jpg` | Findings guide: every spooky name keeps its plain meaning. |
| `04-report-draft.jpg` | The Final Seal report, still locked: blockers as locked doors, coverage as a ledger. |
| `05-report-sealed.jpg` | A sealed report. This is a rehearsal project whose candidates our test script confirmed through the team account, as its seal note says. |
| `06-mobile.jpg` | The same screens at phone width (375 px). |
| `07-kiro.jpg` | How we used Kiro: specs, steering, hooks, custom agents and property tests, all in the public repo. |

**Demo video URL:** `[YouTube URL]`. The video's walkthrough uses a guest copy of the public demo with sample data (D-22); its description says so, and that the narration is an AI text-to-speech voice. Rules from the form: YouTube only; only the first 3 minutes are reviewed; public or unlisted, no password.

## Prizes and eligibility

**Sponsor / Special Prizes** (tick):

- Best Student Project: Costume Contest. Only if all three of us can give the student details below.
- Bonus Blog Prize. Only after `blog.md` is published.
- Social Blitz Prize. Only after the post from `social.md` is live.
- Do **not** tick Best Startup Project or Best Ghost of Kiroween Past unless we are really eligible. Best Kiro Crew App needs a separate Kiro Crew app, which we did not build.

**Submitter country of residence:** Singapore.

**Age of majority** and **eligible jurisdiction:** tick both (decision D-7: all three are adults and university students). Đăng confirms the other two's countries first.

**Category:** Costume Contest.

**Public GitHub repo URL:** https://github.com/dngvmnh/sleuth. Before submitting, check: the repo is public, MIT shows in the About section, `.kiro/` is at the root and not in `.gitignore`.

**Working demo URL:** https://sleuth-eight.vercel.app

**Testing instructions** (judges only; no credentials needed):

```
No account or password is needed.

1. Open https://sleuth-eight.vercel.app and choose "Open the public demo". It is a saved sample run (ProofPay demo): read-only, with real findings from a stored analysis.
2. Pick any room on the Claims map; the Evidence Lantern shows what was found, what was not and the limits of the check. "Findings guide" explains each finding.
3. "Open the Final Seal report" shows what still blocks the seal.
4. To try your own video, choose "Start a project". You get a guest session in this browser only. Upload an English video up to 3 minutes and 50 MB with a script and checklist. Guest videos get a speech-only check (transcript only, no frames sent to the AI). The free worker runs from GitHub Actions, so results can take 10 to 15 minutes; the page says so while it waits.
5. Confirm or reject each candidate yourself. The report shows what still blocks the Final Seal; a speech-only run has no frame evidence, so some checklist items may stay open.

Accuracy is not measured; we publish no accuracy number.
```

**How the project meets the technology requirement** (Kiro):

```
SLEUTH was built in Kiro, spec first. Everything is in the public repo under .kiro/:

- Specs: five specs (ingestion, evidence-analysis, change-impact, review-workspace, final-seal), each with requirements.md, design.md and tasks.md. Every task names an owner, files and a "done when"; tests/kiro-config/specs.test.ts fails if a task cites a missing requirement or touches a file outside its owner's area.
- Steering: nine files. Eight always-on (product, AI safety, architecture, coding standards, frontend, backend, media, team workflow) and one manual (ghost-hunt). The AI-safety file holds the core rule: AI output is a candidate and is never auto-confirmed.
- Hooks: three. Domain tests on save, a contract and OpenAPI check on save, and a typecheck and test of changed packages after each spec task.
- Custom agents: five. Frontend, backend and media builders that may write only their own folders, a QA reviewer with no write tool, and a coordinator that writes only coordination briefs.
- Property-based tests: written from the specs' [PBT] acceptance criteria with fast-check. Over 200 random edit/upload/review histories found three real bugs in code written the same day (details in docs/submission/kiro-usage.md).
- MCP: three servers configured in .kiro/settings/mcp.json but disabled; not used for any result. Powers: not used.
```

**Pre-existing code or work:**

```
None. The project was started for Kiroween 2026 (first commit 8 November 2026). We used standard open-source frameworks and libraries only (Next.js, React, Supabase client, Drizzle, Zod, Vitest, fast-check, Playwright, FFmpeg), and no starter kit or boilerplate. The ProofPay demo inside the app is our own sample data.
```

**Which bonus prizes are you entering?** Best Student, Social Blitz, Blog Prize (only those whose conditions above are met).

**Best Student details:** `[LinkedIn profiles, student e-mails, year and degree, school name for Đăng, Đạt and Phạm Quốc Bảo: each person types their own]`.

**Social Blitz URL:** `[post URL; the post starts with #KiroweenHackathon26]`.

**Blog URL:** `[public blog URL, published during the submission period]`.

**Registered for Kiroween 2025?** `[Đăng answers. Đạt and Phạm Quốc Bảo did not register (D-7). It decides only the Ghost of Kiroween Past prize, which we do not enter.]`

**Submitter type:** Team.

**Employee of AWS?** No.

**Survey questions** (skill development, likelihood to use Kiro again): Đăng's own answer.
