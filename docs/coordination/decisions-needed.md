# Decisions needed

Updated Monday 9 November 2026. Each item: who decides, by when, state.

## Open

| ID | Decision | Who | By | Recommendation |
|---|---|---|---|---|
| D-4 | Team-owned AI provider account with a hard monthly cap. Who owns it, what cap. | Team | Fri 13 Nov | One account, one owner (Bảo), cap set before any adapter runs on real footage. |
| D-5 | Hosting plan: web host, Docker worker host with FFmpeg, paid Supabase tier from 1 Dec. | Team | Fri 20 Nov | See `docs/deploy-plan.md`. Decide by 20 Nov so deploy is rehearsed before 30 Nov. |
| D-6 | Two entries: can one person submit both DEAD AIR and SLEUTH? | Đăng | Wed 11 Nov | NOT SETTLED. See the D-6 note below. |
| D-7 | Eligibility answers from each member: student status, Kiroween 2025, age of majority. | Each member | Wed 11 Nov | Each posts one line. Do not guess for anyone. |
| D-9 | Name the daily-update channel for the async post (done, contract changes, blocked, next PR). | Team | Mon 9 Nov | Any one channel. |

## Decided

| ID | Decision | Outcome | Where |
|---|---|---|---|
| D-1 | Ingestion 7 upload URL lifetime | Option 3: `expiresAt` is a 5-minute window; analysis refuses a late (`upload_late`) or missing (`upload_missing`) file. | PR #4, ingestion requirement 2.1 |
| D-2 | How to merge PR #1 | Merge commit (`deb6dbc`). | PR #1 |
| D-3 | Postgres in CI | Yes, as a throwaway local Supabase stack in the `db` job, never the shared dev project. | PR #5 |
| D-8 | Who adds the hourly purge to `apps/worker` | Đăng wrote it; Bảo owns the worker going forward. | PR #6, ADR 0008 |

## D-6 note: what the official rules say (checked 9 November 2026)

Source: the Kiroween Official Rules on Devpost, [kiroween.devpost.com/rules](https://kiroween.devpost.com/rules).

What I could confirm, from the eligibility part about teams and organizations:

> "An Eligible Individual may join more than one Team or Organization and an Eligible Individual who is part of a Team or Organization may also enter the Hackathon on an individual basis."

What this settles: one person may be on the SLEUTH team and also be on, or enter alone with, DEAD AIR.

What it does not settle: whether one entrant may have more than one submission, or whether the same person may win with two. Many Devpost rule sets have a separate "multiple submissions" clause in the submission requirements. I could not read the full rules page: it refused automated access (HTTP 403), so I have not seen that section and I make no claim about it.

What only Đăng can do: open the rules page in a browser, read the "Submission Requirements" and "Eligibility" sections, and search the page for "more than one" and "multiple". Record the exact section name and wording here. If the page is silent on multiple submissions, ask the organisers in the Devpost discussion forum and quote their answer.
