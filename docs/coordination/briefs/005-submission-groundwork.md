# BRIEF 005 (C): submission groundwork only Đăng can do

Date: 13 November 2026. Owner: Đăng. Written by the coordinator. Do after brief 004, or in the gaps while a worker run or a CI run is waiting.
Paste everything below the line into the backend-builder session.

---

You are the SLEUTH backend engineer. PowerShell on native Windows, no `&&` chaining, English everywhere. Repo: `C:\Data\Singapore\SMU\Sleuth\sleuth`. No mention of any AI tool other than Kiro, in docs or commits. Never print or commit a key. Free tiers only. Never force-push. One commit per step; run lint, typecheck, tests and build before each push. Quote only numbers that a test or the harness printed, with the source beside them. Mark every draft DRAFT.

## Step 1: Kiro usage write-up

Write `docs/submission/kiro-usage.md` from `docs/kiro-engineering-journal.md`. Use the journal's own "What Kiro produced" and "What we had to fix or reject" lines. Cover steering, hooks, agents, specs, property tests and the review and checklist routine. Give dated, concrete examples with PR numbers or commit hashes (for example the three review and invalidation bugs that property tests caught, the mutation check that proved the contract suite, and the `.gitignore` `coverage/` rule that hid a route). End with a list of what only Đạt and Bảo can add in their own words. Do not invent anything the journal does not say.

## Step 2: dogfood plan for our own demo video

Write `docs/submission/dogfood-plan.md` (team-plan principle 6: run SLEUTH on our own submission video and show the Final Seal report in the video).
- Order: write the demo script and checklist first; record; run SLEUTH on the recording with the real worker; show the real result in the video.
- Dates (SGT): script and checklist locked Wed 25 Nov; production stable and rehearsed Sun 29 Nov; record Mon 30 Nov; analyse Tue 1 Dec; feature freeze Wed 2 Dec 23:59; final edit Thu 3 Dec; submit by Fri 4 Dec 18:00.
- Who records and who narrates. Where the files live (videos stay out of Git).
- A fallback if the real run misbehaves: show the demo project and say so on screen. Never fake a result.
- Read the official rules page for the video requirements (length, language, what must appear) and quote them with a link. If the page cannot be read, say so and stop; I will read it.

## Step 3: keep-alive through judging

- Read Supabase's page on free project pausing and quote the rule with a link. Do not guess a number.
- Write `.github/workflows/keep-alive.yml`: scheduled twice a week, plus manual run, only on `dngvmnh/sleuth`, one cheap read-only query against `sleuth-prod` through the existing `DATABASE_URL` secret. It prints "ok" or the error code and nothing else. If a different mechanism is better, say so and why.
- Add to `docs/deploy-plan.md`: GitHub switches off scheduled workflows after a long quiet period in a public repo (check the current rule and quote it), the cron can start minutes late, and what to do after submission while judging continues.
- Do not turn on the worker schedule. That waits for the speech-only mode.
- `.github/` is a shared file: label the PR for review by Đăng and tell Bảo and Đạt.

## Step 4: launch checklist

Write `docs/submission/launch-checklist.md` with dates and owners: Kiro credits request (closes Wed 2 Dec 04:00 SGT, confirm for all three), Devpost registration and teammates added, video upload, Devpost text from the DRAFT files, blog and social posts, the 3 outside testers (30 Nov to 2 Dec), the weekly "open both Supabase projects" reminder, rollback (promote the previous Vercel deployment). Mark what is done, what is open and who owns it.

## Allowed to change

`docs/submission/` (new files and the DRAFT files), `.github/workflows/keep-alive.yml`, `docs/deploy-plan.md`, `docs/kiro-engineering-journal.md` (one entry per PR). Nothing else. If the brief is wrong or too big, stop and say why.

## Done when (run each command, report the real output; a skipped suite is not a pass)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- Keep-alive workflow: a manual run (`gh workflow run keep-alive.yml`) finishes green and prints only "ok".
- Every number in the new docs has a source beside it. A search for other AI tool names in `docs/submission/` finds none.
- Each PR is assigned to @dngvmnh, `check` and `db` green.

## Do not

- Do not commit to or push `main`; work on a new branch from `origin/main`. Do not merge PRs; I do.
- Do not claim accuracy numbers: none exist until ea 13 runs.
- No AI co-author trailer. Stop only if a check still fails after two different fix attempts, or if you need a secret, a paid service, or a change to a fixed decision or contract.

## Report format (so I can paste it to the coordinator with "verify")

```
BRIEF 005 report
Branch / PR per step: <name> / <url>
Commits: <hash subject> (one per line)
Done-when results: <command: real result> (one per line)
Rules quoted (video requirements, Supabase pause): <quote with link, or "page not readable">
Not run or skipped: <list, or none>
Only Đăng can do: <list>
```
