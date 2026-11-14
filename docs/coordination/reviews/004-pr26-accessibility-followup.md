# Review 004: PR #26, accessibility follow-up for review-workspace 14 (Đạt)

Date: 13 November 2026. Reviewer: Đăng. Before merge.
Checked: the PR file list, the full diff of the five source and test files, the task tick, and `docs/accessibility.md` on the branch, all read with git and `gh` at `origin/fix/accessibility-followup`. I did not run lint, typecheck, tests, build or the ghost scan (the builder session was working). CI is green: `check` and `db`.

## Verdict

Approve. Merge now. Merge it before #27, because both add to the journal and the second one to merge has to keep both sides.

## Checks (list from `reviews/README.md`)

| # | Check | Result |
|---|---|---|
| 1 | CI | `check` and `db` green. Supabase Preview skipped, as usual. |
| 2 | `contract-change` | Not needed. No file in `packages/contracts/`, schema, migrations, `openapi.yaml` or `fixtures/golden/`. |
| 3 | Shared files | None changed. No `package.json`, lockfile, `.github/` or root config. The journal gets +113 lines. |
| 4 | Area | All files are in `apps/web/`, `tests/e2e/`, `docs/` and the review-workspace `tasks.md`. Đạt's area. |
| 5 | Spec: task 14 "done when" | Met on the text. "axe reports no serious or critical issues": the doc records 9 of 9 (9 Nov) and the PR reports 37 of 37 targeted Playwright tests with one worker. "The doc lists known gaps honestly": yes, see below. |
| 6 | Safety | Diff has only class names, `aria-describedby` and tests. No secret, no `.env`, nothing that sets evidence to `confirmed`. Ghost scan not run by me; it matters little for this diff. |
| 7 | Language and names | English. Names correct. |

## What the code does

- `seal-panel.tsx`: the disabled "Apply the Final Seal" button now points `aria-describedby` at the intro sentence and each blocker sentence, not at a wrapper around a labelled list. Cause and live check are in the doc (Narrator read the list label instead of the reasons). A new unit test asserts the description text and that the list label is not in it.
- `timeline.tsx` and `sentence-list.tsx`: the selected marker and line get a double border in Windows contrast themes. The range bar and playhead moved from a background to a border, because contrast themes drop backgrounds. The bar keeps its 4 px height (`h-1` became `border-t-4`), so the normal view does not change.

## Evidence for the accessibility claims

- Screen reader results: Đạt listened directly with Narrator on 2026-11-13 for the Final Seal button and heading navigation. The first walkthrough (2026-11-11) was an agent pressing keys and reading the Speech recap text, and the doc says so.
- Honest gaps listed: one person, one screen reader (Narrator), one browser (Edge); NVDA and JAWS not used; other contrast themes not tested; the real HTML video player is not wired because the API has no playable video URL.

## Non-blocking nits

1. `docs/accessibility.md` still holds stale statements next to the new ones: "Still not checked: what Narrator actually says ... nothing was heard" (about line 111), "Windows High Contrast ... not checked here" (line 47) and "Not yet confirmed here" (line 164). Each is followed by a note that it was done later. A reader can take the old line as current. Tidy in a small follow-up.
2. The "announcement overlap not confirmed" limit is in the PR body; keep it in the known-gaps list too.

## Follow-ups

| Who | What |
|---|---|
| Đạt | Tidy the stale lines in `docs/accessibility.md`. |
| Đạt | When the API gets a playback URL (brief 004), run the video player's keyboard and caption checks and add them to the doc. |
