# SLEUTH coordination board

Owner: coordinator session. Updated: Monday 9 November 2026, ~14:50 SGT. Source: git, GitHub and files only. No lint, test or build was run for this snapshot, because the backend-builder session is working.

Dates (SGT): feature freeze Wed 2 Dec 23:59. Internal submit Fri 4 Dec 18:00. Official deadline Sat 5 Dec 06:00. Kiro credits request closes Wed 2 Dec 04:00.

## 1. Git and GitHub

| Item | State |
|---|---|
| `origin/main` | `30f588e` (specs and team plan). Nothing after it. |
| Local `main` | `978dc4a`. It sits on the PR #1 head and tracks `origin/feat/backend-milestones-1-3`, not `origin/main`. |
| PR #1 `feat/backend-milestones-1-3` | OPEN, mergeable, merge state CLEAN, 97 files, +11870 / -210. No reviews. No labels. |
| PR #1 CI | Latest run green (run 42562156224). Two earlier runs red. |
| `origin/main` CI | RED at `30f588e` (run 42471034430). Cause not read from logs; the likely cause is `packages/media` missing from the commit (see 2). |
| `fix/track-packages-media` | `f549c1c`. Already merged into PR #1 (`976c2e4`). Delete after merge. |
| Branch protection on `main` | NONE. |
| Label `contract-change` | Does not exist. PR #1 changes contracts. |
| Collaborators | dngvmnh, baofrovn, phatdat220707 all present. |
| Untracked | `.kiro/agents/coordinator.md` (not committed). |

Is main sane? Remote main is clean but stale and red. The milestone commits are not on remote main. They are on local `main`, which equals the PR head, so nothing was pushed to `main` directly. The risk is local: after the merge, local `main` must be re-pointed at `origin/main`.

## 2. Ticked versus really done

Legend: PROVEN = ran and passed by a check I can see (CI or journal with numbers). LOCAL-ONLY = passed on Đăng's machine against the shared Supabase dev DB; CI has no Postgres, so those suites skip in CI. NOT BUILT = unticked, nothing to check.

| Spec | Ticked | Verdict |
|---|---|---|
| ingestion 1-4 | yes | PROVEN in CI (fixture store, limits, audit). |
| ingestion 5, 6, 8, 9 | yes | LOCAL-ONLY. Journal reports real-DB results. CI skips them. Nobody else has reproduced them. |
| ingestion 10 | yes | Purge works on both stores (store tests). The hourly caller in `apps/worker` does not exist. ADR 0008 gives it to Bảo. Partly done. |
| ingestion 7 | no | Correct. Signed URLs live 2 hours, spec says 5 minutes. Needs a decision (D-1). |
| change-impact 1-3, 5-8, 10 | yes | PROVEN in CI (unit, property, API-level test). |
| change-impact 4 | no | Correct. Engine ignores `segmentIds`. Bảo's task. |
| change-impact 9 | no | Correct. Needs a DB transaction. Đăng. |
| final-seal 1-5 | yes | PROVEN in CI at fixture level. Supabase seal paths run LOCAL-ONLY. |
| final-seal 6-10 | no | Correct. UI not started. |
| review-workspace 1-14 | no | Correct. Only a one-page placeholder and `api-client.ts` exist. |
| evidence-analysis 1-16 | no | Correct. `packages/media` has mocks and validation only. No FFmpeg, no real provider, no clips. |

Nothing is ticked falsely that I could find. The gap is trust: the four Supabase tasks (5, 6, 8, 9) and the seal store paths have no check anyone but Đăng can see. Unverified claim: I did not re-run any test. The numbers (354 unit, 54 property, 14 contract) come from the journal and PR notes.

Not yet ticked in any `tasks.md`: coordinator and journal entries match the code I could see.

## 3. Blockers today

| Person | Blocker | Fix |
|---|---|---|
| Đạt | `origin/main` lacks `segmentState`, `updatedAt`, Final Seal endpoints and the Supabase store. His timeline (review-workspace 7) and dashboard (3) need them. | Merge PR #1 (B-1). |
| Bảo | `packages/media` is NOT on `origin/main` (the old `.gitignore` rule `media/` hid it). Nothing exists to branch from. Also no provider decision, no keys, no clips. | Merge PR #1 (B-1). ADR 0007 is his first task. |
| Both | No branch protection, no `contract-change` label, no daily-update channel named. | B-2, B-3. |
| Both | Fresh-clone setup (team-plan section 8) is untested by anyone but Đăng. | Each runs it after the merge and reports. |

## 4. Critical path to a working end-to-end demo

1. Merge PR #1 so everyone has the same base. (Đăng, today.)
2. Real analysis: FFmpeg probe and frames (ea 1, 2) then provider ADR (ea 3) then alignment and matching (ea 5, 6) then real adapters (ea 10). Bảo. This is the longest chain and the biggest risk.
3. Worker on Postgres: ea 12 and 16 need ingestion 5-7 (done except 7). Needs ingestion 7 decided.
4. Review UI: rw 1-6 then Timeline and Lantern (7-9) then Exorcism (10). Đạt. It can run on fixtures with no backend wait.
5. Final Seal UI (fs 6-9). Đạt, after rw 6.
6. Our own recorded clips (ea 11, 14, 15) and the first evaluation run (ea 13). Needed before the demo looks real.
7. Deploy (web plus Docker worker with FFmpeg), then dogfood, video, Devpost.

The long pole is step 2. The demo can show the UI on fixtures, but "real ghosts on a real video" needs ea 1-6 and 10.

## 5. Top five risks

1. Word-overlap matching is weak on real transcripts (ea 5, 6). Highest technical risk. Test on real clips by 20 Nov.
2. Bảo's lane has not started and has the longest chain. Only one person on it.
3. Backend proof is local-only. CI skips all Postgres suites. A second person must reproduce it, or CI needs a Postgres service (D-3).
4. AI cost and keys. No team-owned account or spend cap yet. Public "try your own video" must not exist before limits and cap.
5. Hosting outliving judging, and eligibility (age of majority, student status, two-entry rule with DEAD AIR) are all unanswered. Cheap to ask now, costly to find out on 4 Dec.

## 6. Week plan, 9-15 November

Rule for all lanes: small PRs, CI green, journal entry, tick `tasks.md` in the same PR. Dependency adds: one person at a time.

### Lane BACKEND: Đăng (@dngvmnh)
| Day | Work |
|---|---|
| Mon 9 | BRIEF 001: get PR #1 merged, protect `main`, create label, commit coordinator. Decide D-1 with team. |
| Tue 10 | Reproduction help: pair with Bảo or Đạt on fresh-clone setup. Start change-impact 9 (Supabase revisions transaction). |
| Wed 11 | Finish change-impact 9. Ingestion 7 per decision D-1. Review Đạt's `feat/web-test-tooling` (shared files). |
| Thu 12 | Review PRs. Add Postgres CI service if D-3 says yes. Prepare the Supabase handler contract for ea 12. |
| Fri 13 | Worker side: advise Bảo on the Postgres queue test (ea 16). Journal. |
| Sat-Sun 14-15 | Light: review only. Ready ea 12 inputs. |

### Lane FRONTEND: Đạt (@phatdat220707)
| Day | Work |
|---|---|
| Mon 9 | After merge: run section 8 setup, report result. Request Kiro credits. |
| Tue 10 | rw 1 (test tooling, shared files, tell team before touching lockfile). rw 2 (API client). |
| Wed 11 | rw 3 (shell and dashboard), rw 4 (timeline helpers). |
| Thu 12 | rw 5 (player port), rw 6 (workspace hook and page). |
| Fri 13 | rw 7 (timeline with keyboard). |
| Sat-Sun 14-15 | rw 8 (sentence list). Stretch: rw 9. |
| Any day | ea 15: record clip-5 with the unscripted line, follow `tests/evaluation/clips/clip-5/RECORDING.md`. Moved from Đăng. Tick only after Bảo's ea 9 and ea 11 are on main. |
Target by Sun 15: workspace page shows the demo project timeline on fixtures.

### Lane MEDIA: Phạm Quốc Bảo (@baofrovn)
| Day | Work |
|---|---|
| Mon 9 | After merge: setup plus `winget install Gyan.FFmpeg`. Request Kiro credits. |
| Tue 10 | ea 1 (FFmpeg probe and audio). |
| Wed 11 | ea 2 (frames and cleanup). |
| Thu 12 | ea 3 (provider ADR 0007, comparison only, no keys). ea 4 (validation property tests). |
| Fri 13 | ea 5 (script alignment). |
| Sat-Sun 14-15 | ea 6 start (matching and confidence). change-impact 4 (`segmentIds`) if time. |
Target by Sun 15: probe a real video, extract audio and frames, ADR written.

### Cross-cutting this week
- Everyone answers the day-one questions (student, Kiroween 2025, age of majority). Owner: Đăng collects.
- Decide the two-entry question (DEAD AIR plus SLEUTH) from the official rules. Owner: Đăng.
- Hosting and AI-key plan (D-4, D-5).

## 7. Open PRs and reviews
- PR #1: no review yet. See `reviews/` for review notes (none written).
- Next briefs: 002 queued after PR #1 merges.
