# SLEUTH coordination board

Owner: coordinator session. Updated: Monday 9 November 2026, evening SGT. Source: git, GitHub and files at `main` `8085557`.

Dates (SGT): feature freeze Wed 2 Dec 23:59. Internal submit Fri 4 Dec 18:00. Official deadline Sat 5 Dec 06:00. Kiro credits request closes Wed 2 Dec 04:00.

## 1. Git and GitHub

| Item | State |
|---|---|
| `origin/main` | `8085557`. CI green (`check` and `db` jobs). |
| PRs | #1 to #6 and #8 merged. #7 was a CI preview, closed. No open PRs. |
| PRs from Đạt or Bảo | None yet. No branches from them on the remote. |
| CI | `check`: lint, typecheck, unit, property, contracts, build. `db`: a throwaway local Supabase stack runs every Postgres, Auth and Storage suite; a missing setting fails the job. |
| Branch protection on `main` | NONE. Đăng allows direct commits to `main` for coordination work. |
| Label `contract-change` | Exists. |
| Stale remote branches | `chore/coordination`, `feat/change-impact-9-supabase`, `feat/ci-supabase-db`, `feat/ea-15-clip-prep`, `feat/ingestion-10-worker-purge`, `feat/ingestion-7-upload-window`. All merged; safe to delete. |

## 2. Ticked versus really done

PROVEN = a check anyone can see passes (CI). NOT BUILT = unticked, nothing to check.

| Spec | Ticked | Verdict |
|---|---|---|
| ingestion 1-10 | all | PROVEN. Fixture parts in `check`; Supabase parts (5-10) in the `db` job. |
| change-impact 1-3, 5-10 | yes | PROVEN. Task 9 runs the random-history property test on both stores. |
| change-impact 4 | no | NOT BUILT. Engine ignores `segmentIds`. Bảo. |
| final-seal 1-5 | yes | PROVEN (fixture in `check`, Supabase seal paths in `db`). |
| final-seal 6-10 | no | NOT BUILT. UI. Đạt. |
| review-workspace 1-14 | no | NOT BUILT. Đạt. |
| evidence-analysis 1-14, 16 | no | NOT BUILT. Bảo (14 is Đạt's). |
| evidence-analysis 15 | no | Prepared, not recorded. Moved to Đạt. Folder `tests/evaluation/clips/clip-5` has the recording script, demo script and checks; the clip and labels are missing on purpose. |

Đăng's coding lane is complete. What is left for Đăng is coordination, review and launch prep.

## 3. Blockers today

| Person | Blocker | Fix |
|---|---|---|
| Bảo | Has not started. Needs FFmpeg installed, a provider decision (ADR 0007, D-4) and keys for real adapters. | Start ea 1 to 4 now; none of them need keys. |
| Đạt | Nothing on the backend side. Everything the UI needs is on `main` (segment states, `updatedAt`, Final Seal endpoints, Supabase store). | Start rw 1. |
| ea 15 (Đạt) | Clip format is not fixed until Bảo's ea 9 and 11 land. | Record any time; label after ea 9 and 11. |
| Team | No daily-update channel named (D-9). Eligibility answers missing (D-7). | Each member answers. |

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
3. AI cost and keys. No team-owned account or spend cap yet (D-4). Public "try your own video" must not go live before limits and a cap.
4. Hosting not chosen (D-5). Deploy must be rehearsed before 30 Nov.
5. Eligibility (D-7) and the two-entry question (D-6) are not settled.

## 6. Week plan, 9-15 November

Rule for all lanes: small PRs, CI green, journal entry, tick `tasks.md` in the same PR. Dependency adds: one person at a time.

### Lane BACKEND and COORDINATION: Đăng (@dngvmnh)
| Day | Work |
|---|---|
| Mon 9 | Done: BRIEF 001 and 002, all backend tasks, CI database job. Board, D-6 answer, worker contract, deploy plan, submission drafts. |
| Tue 10 to Fri 13 | Review PRs from Đạt and Bảo (shared files, `contract-change` label). Pair on fresh-clone setup. Collect D-4, D-5, D-7, D-9 answers. |
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
- Hosting and AI-key plan (D-4, D-5). Draft: `docs/deploy-plan.md`.

## 7. Open PRs and reviews
- No open PRs. Review notes go in `reviews/`.
- Briefs 001 and 002 are complete.
