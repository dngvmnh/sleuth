# SLEUTH coordination board

Owner: coordinator session. Updated: Tuesday 10 November 2026. Source: git, GitHub and files at `main` `89ea240`.

Dates (SGT): feature freeze Wed 2 Dec 23:59. Internal submit Fri 4 Dec 18:00. Official deadline Sat 5 Dec 06:00. Kiro credits request closes Wed 2 Dec 04:00.

## 1. Git and GitHub

| Item | State |
|---|---|
| `origin/main` | `89ea240`. CI green (`check` and `db` jobs). |
| PRs | #1 to #6 and #8 to #19 merged (#9 to #19 by Phạm Quốc Bảo). #7 was a CI preview, closed. No open PRs. |
| CI | `check`: lint, typecheck, unit, property, contracts, build. `db`: a throwaway local Supabase stack runs every Postgres, Auth and Storage suite. |
| Label `contract-change` | Exists. |

## 2. Ticked versus really done

| Spec | Ticked | Open |
|---|---|---|
| ingestion | 10/10 | none |
| change-impact | 10/10 | none |
| final-seal | 5/10 | 6-10 (UI, Đạt) |
| review-workspace | 0/14 | all (Đạt) |
| evidence-analysis | 9/16 | 3 (ADR 0007 proposed, not accepted), 7, 10 (adapters merged in PR #18, not ticked), 11, 13 (Bảo); 14, 15 (clips, Đạt) |

Đăng's coding lane is complete.

## 3. Blockers today

| Person | Blocker | Fix |
|---|---|---|
| Bảo | ADR 0007 picks the paid Gemini tier; the team rule is now free only (D-4). | D-4 is decided (free tiers). Amend ADR 0007 to match, then tick ea 3. Check result: Deepgram and `gemini-3.6-flash` work; `gemini-3.8-flash` failed 3 of 3 tries on the free tier. |
| Bảo | Public uploads must not go to the free Gemini tier (D-4). Supabase mode refuses mock providers. | A "no video analysis" mode in the worker. |
| Đạt | Review UI not started (rw 1-14, fs 6-10). Nothing on the backend side blocks it. | Start rw 1. |
| Đạt | ea 14, 15: clips not recorded. | Record per `tests/evaluation/clips/clip-5/RECORDING.md` and the protocol from ea 9. |
## 4. Critical path to a working end-to-end demo

1. Real analysis: FFmpeg probe and frames (ea 1, 2), provider ADR (ea 3), alignment and matching (ea 5, 6), real adapters (ea 10). Bảo. Longest chain, biggest risk.
2. Worker on Postgres: ea 12 (Supabase handler) and ea 16 (queue test). Inputs ready: see `docs/worker-supabase-contract.md`.
3. Review UI: rw 1-6, then Timeline and Lantern (7-9), then Exorcism (10). Đạt. Runs on fixtures with no backend wait.
4. Final Seal UI (fs 6-9). Đạt, after rw 6.
5. Our own recorded clips (ea 11, 14, 15) and the first evaluation run (ea 13).
6. Deploy (`docs/deploy-plan.md`), then dogfood, video, Devpost.

## 5. Top five risks

1. Word-overlap matching is weak on real transcripts (ea 5, 6). Test on real clips by 20 Nov.
2. Bảo's lane has not started and has the longest chain. Only one person on it.
3. Free tiers only. Gemini free tier may use content to improve its products, so visitors' videos must not reach it (D-4). Deepgram's free credit runs out once.
4. Free hosting (D-5): the GitHub Actions worker starts jobs up to 5 minutes late or more, and Supabase Free pauses idle projects. Rehearse before 30 Nov.
5. Gemini free tier: `gemini-3.8-flash` did not answer in 3 tries, and `gemini-3.6-flash` failed 1 of 4. Retries and a fallback model are needed in the worker.

## 6. Week plan, 9-15 November

Rule for all lanes: small PRs, CI green, journal entry, tick `tasks.md` in the same PR. Dependency adds: one person at a time.

### Lane BACKEND and COORDINATION: Đăng (@dngvmnh)
| Day | Work |
|---|---|
| Mon 9 | Done: BRIEF 001 and 002, all backend tasks, CI database job. Board, D-6 answer, worker contract, deploy plan, submission drafts. |
| Tue 10 to Fri 13 | Review PRs from Đạt and Bảo (shared files, `contract-change` label). Pair on fresh-clone setup. Collect D-4, D-5 and D-7 answers. |
| Sat-Sun 14-15 | Review only. |

### Lane FRONTEND: Đạt (@phatdat220707)
| Day | Work |
|---|---|
| Mon 9 | Run section 8 setup, report result. Request Kiro credits. |
| Tue 10 | rw 1 (test tooling, shared files, tell team before touching lockfile). rw 2 (API client). |
| Wed 11 | rw 3 (shell and dashboard), rw 4 (timeline helpers). |
| Thu 12 | rw 5 (player port), rw 6 (workspace hook and page). |
| Fri 13 | rw 7 (timeline with keyboard). |
| Sat-Sun 14-15 | rw 8 (sentence list). Stretch: rw 9. |
| Any day | ea 15: record clip-5 with the unscripted line, follow `tests/evaluation/clips/clip-5/RECORDING.md`. Tick only after Bảo's ea 9 and ea 11 are on main. |
Target by Sun 15: workspace page shows the demo project timeline on fixtures.

### Lane MEDIA: Phạm Quốc Bảo (@baofrovn)
| Day | Work |
|---|---|
| Mon 9 | Setup plus `winget install Gyan.FFmpeg`. Request Kiro credits. |
| Tue 10 | ea 1 (FFmpeg probe and audio). |
| Wed 11 | ea 2 (frames and cleanup). |
| Thu 12 | ea 3 (provider ADR 0007, comparison only, no keys). ea 4 (validation property tests). |
| Fri 13 | ea 5 (script alignment). |
| Sat-Sun 14-15 | ea 6 start (matching and confidence). change-impact 4 (`segmentIds`) if time. |
Target by Sun 15: probe a real video, extract audio and frames, ADR written.

### Cross-cutting this week
- Everyone answers the day-one questions (student, Kiroween 2025, age of majority). Owner: Đăng collects. Do not guess for anyone.
- Free hosting and AI plan (D-4, D-5): `docs/deploy-plan.md`, `decisions-needed.md`.

## 7. Open PRs and reviews
- No open PRs on 10 November. Review notes go in `reviews/`.
- Decisions: D-4, D-5 and D-7 are decided (`decisions-needed.md`). D-4 still has one task for the worker owner: a "no video analysis" mode, so visitors' videos never reach Gemini.
- Deploy prep is written: `docs/deploy-plan.md` (production Supabase, Vercel variables, secrets) and `.github/workflows/worker.yml` (manual run only until the mode above exists).
- Manual provider check: `pnpm tsx scripts/provider-check.ts <clip>` prints counts only.
- Briefs 001 and 002 are complete.
