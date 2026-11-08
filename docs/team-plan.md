# SLEUTH — team plan, sharing checklist, prize strategy

Written 8 November 2026. Deadline: 5 December 2026, 06:00 Singapore time (4 December, 14:00 Pacific). Internal freeze: 4 December, 18:00 Singapore time.

## 1. Changes to the original plan, and why

1. **Settle the two-entry question first.** DEAD AIR (dngvmnh/Dead-Air) is already a Kiroween 2026 build. Check the official rules on whether one person may submit more than one project. If allowed, enter DEAD AIR in **Resurrection** (it revives analogue broadcast TV) and SLEUTH in **Costume Contest**, so the two never compete for the same category prize. If not allowed, choose one now.
2. **Fixture mode first.** The app and worker must run with no database, no keys and no Docker, using one checked-in golden fixture. That fixture is the contract between the three of us. This is what lets everyone start on 10 November instead of waiting for the backend.
3. **Two AI providers, not five.** Transcription with word timestamps, and one multimodal video-analysis call that also reads on-screen text. Separate OCR only if the evaluation shows it is needed. This saves the media owner about a week.
4. **Normalised hashing.** Typo and punctuation fixes must not mark evidence stale, or the Poltergeist feature will look noisy in the demo.
5. **Judges must get in within 10 seconds.** A public read-only demo project with no login, plus "try your own video" behind anonymous sign-in with limits. A login wall costs score on Potential Impact and Design.
6. **Use SLEUTH on our own submission video.** Write the demo script and checklist first, run SLEUTH on our own recording, and show the Final Seal report in the video and on Devpost. This proves the product works on real footage, and it is the strongest story for Best Demo.
7. **Hosting must survive judging, not just the deadline.** Judging continues after 5 December. Supabase free projects pause after about a week without activity, and free web hosts put services to sleep. Budget a small paid tier (or a scheduled keep-alive) from 1 December until results, and a worker host that installs FFmpeg (a Docker host such as Fly.io, Railway or Cloud Run).
8. **Keep the AI humble.** Matches are candidates; confidence is a ranking, not accuracy; "Needs Outside Proof" for claims footage cannot show. Report measured precision and recall from hand-labelled clips, never invented numbers.

## 2. Ownership (nobody edits another area without a pull request review from its owner)

| Area | Owner | Directories |
|---|---|---|
| Frontend and product experience | Đạt (@phatdat220707) | `apps/web/app/(workspace)/`, `apps/web/components/`, `apps/web/features/`, `apps/web/styles/`, `tests/e2e/` (Playwright) |
| Backend, database, revisions | Đăng (@dngvmnh), also scaffold owner | `packages/contracts/`, `packages/domain/`, `packages/db/`, `apps/web/app/api/` |
| Media worker and evidence engine | Phạm Quốc Bảo (@baofrovn) | `apps/worker/`, `packages/media/`, `packages/evidence-engine/`, `tests/evaluation/` |
| Shared files: review from @dngvmnh plus the owner of the affected area | Đăng + area owner | `fixtures/golden/`, root configs, `pnpm-lock.yaml`, `.github/`, `.kiro/steering/` |

Rules: contracts change only through a pull request labelled `contract-change` with the golden-fixture test passing; one person adds dependencies at a time (lockfile conflicts); small pull requests merged daily; CI green before merge.

## 3. Timeline

| Dates | Goal | Done when |
|---|---|---|
| 8–9 Nov | Scaffold owner runs Kiro bootstrap Phases 1–2 | Fresh clone runs `pnpm dev` and `pnpm worker` in fixture mode; CI green; merged |
| 10 Nov | Phases 3–4 (hooks, agents, specs); everyone starts | Each person has 3 days of tasks in their spec |
| 11–16 Nov | Ingestion | Upload a real video and see its timestamped transcript beside the player |
| 17–23 Nov | Evidence | Real ghosts and phantom dialogue on the timeline for the ProofPay demo |
| 24–29 Nov | Change impact and Exorcism | Edit one sentence: its evidence goes stale, the rest stays |
| 30 Nov–2 Dec | Integration, design polish, deploy, 3 outside testers | A stranger completes the flow without help |
| 3–4 Dec | Freeze. Record the video, write Devpost, blog and social posts | Submitted by 4 Dec 18:00 SGT |

Note: the Kiro free-credit request closes 2 December, 04:00 Singapore time. All three should request credits this week.

## 4. What to share with teammates

### Share (safe; it lives in the repository)
- GitHub collaborator invites to `dngvmnh/sleuth` (each person uses their own account; never share a personal access token).
- `.env.example` with variable names and blank values.
- Contracts, golden fixture, OpenAPI file, ADRs, `.kiro/` steering and specs.
- The sample script, checklist and video (ProofPay demo, which we own; no confidential or third-party footage).

### Share privately, through a password manager or one-time secret link (never Discord, chat, issues or commits)
- Supabase dev project: invite each person to the Supabase organisation instead of sending keys where possible; otherwise the `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`.
- AI provider keys, from one team-owned account with a hard monthly spending limit. Only the media owner needs them before integration week; everyone else uses mock providers.

### Never share, never commit
- Personal Kiro accounts and credits (each person requests their own).
- Personal GitHub tokens.
- Production deployment secrets: these go only into the host's environment settings and GitHub Actions secrets.
- If a secret ever reaches Git history, rotate it. Deleting the line is not enough.

### Environment variables (`.env.example`)
```
SLEUTH_DATA_MODE=fixture            # fixture | supabase
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # public by design; safe only with Row Level Security on
SUPABASE_SERVICE_ROLE_KEY=          # server and worker only
DATABASE_URL=
SUPABASE_STORAGE_BUCKET=video-assets
TRANSCRIPTION_PROVIDER=mock
TRANSCRIPTION_API_KEY=
VIDEO_ANALYSIS_PROVIDER=mock
VIDEO_ANALYSIS_API_KEY=
MAX_VIDEO_SECONDS=180
MAX_FRAMES_PER_VIDEO=60
DAILY_ANALYSIS_LIMIT_PER_USER=5
```

### Machine setup notes
- Node 22, pnpm, Git. FFmpeg only for the media owner.
- Run Kiro on a native Windows folder, not a WSL path: Kiro's file tools and terminal failed on WSL paths during the DEAD AIR build.
- Prefer the hosted Supabase dev project over local Supabase, so nobody needs Docker on Windows.

## 5. Prize strategy

One project can win one Overall or one Category prize, plus any number of bonus prizes.

| Prize | Can we qualify? | Action |
|---|---|---|
| Overall 1st–3rd / Best Costume Contest | Yes | Main target: working end-to-end product, polished haunted UI, strong Kiro write-up |
| Best Student Project: Costume Contest | Only if all three are enrolled students | Collect each member's LinkedIn, student email, year, degree, school now |
| Best Demo | Automatic | Dogfood story, under 3 minutes, real app on screen |
| Bonus Blog | Yes, cheap | One public post on a third-party platform (dev.to, Medium, Hashnode) saying it was written for Kiroween 2026 |
| Social Blitz | Yes, cheap | Post starting with `#KiroweenHackathon26` about what Kiro changed for us |
| Best Kiro Crew App | Only with a second, separate public repo built on Kiro Crew | Optional "Release Warden" companion, time-boxed to 2 days, only after 29 Nov if core is done |
| Best Startup Project | No, unless one of us is truly a founder with a startup website | Skip; do not invent a startup |
| Best Ghost of Kiroween Past | Only if a member registered for Kiroween 2025 | Check; skip if no one did |

**Eligibility check to do this week:** the rules require every entrant to be above the age of majority in their country of residence. Singapore's general age of majority is 21. Anyone younger than that should email the organisers (via Devpost support) before we rely on any prize. Do not misstate an age.

### What judges score, and where each point comes from
- **Potential Impact:** real reviewers (three outside testers), the dogfood report, measured time saved on one review.
- **Technological Implementation (Kiro):** specs per subsystem, fileMatch steering per area, four hooks, custom agents, MCP, property tests with a story of a bug they caught. Keep `docs/kiro-engineering-journal.md` updated daily; it becomes the write-up.
- **Design:** complete flow, every state handled, plain-English labels, reduced-motion support.
- **Innovation:** evidence graph plus change impact; nobody else QA-checks demo claims against footage.
- **Presentation:** crime-scene story, the Poltergeist moment at about 2:10, Final Seal at the end.

## 6. Per-developer Kiro prompts (use after Phase 2 is merged)

**Frontend (Đạt):** "You are the SLEUTH frontend engineer. Follow `.kiro/steering/` and `.kiro/specs/review-workspace/` and `.kiro/specs/final-seal/`. Work only in the frontend directories listed in `team-workflow.md`. Use the fixture API client; do not write backend logic or change contracts. Implement the next unchecked task, add component and Playwright tests, run them, and report the real result."

**Backend (Đăng):** "You are the SLEUTH backend engineer. Follow `.kiro/steering/` and `.kiro/specs/ingestion/` and `.kiro/specs/change-impact/`. Work only in contracts, domain, db and `apps/web/app/api/`. Keep fixture mode working. Every business rule gets a unit test and, where the spec marks it, a fast-check property test. Implement the next unchecked task, run the tests, report the real result."

**Media (Bảo):** "You are the SLEUTH media and evidence engineer. Follow `.kiro/steering/` and `.kiro/specs/evidence-analysis/`. Work only in the worker, media and evidence-engine packages and `tests/evaluation/`. Keep mock providers working and the golden-fixture test passing. Never mark AI output confirmed. Implement the next unchecked task, run the tests and the evaluation harness, report the real result."

## 7. Day-one message to the team

1. Accept the GitHub invite and request your own Kiro credits.
2. Confirm: are you a current student (school, degree, year)? Did you register for Kiroween 2025? Are you above the age of majority where you live?
3. Wait for the scaffold merge (target 9 November night), then clone, run `pnpm install && pnpm dev`, and open your spec.
4. Post a short async update in the team channel each day: done, contract changes, blocked, next pull request.
