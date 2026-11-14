# BRIEF 006, frontend-builder (Đạt): the UI revamp on the hollow theme

Date: 14 November 2026. Owner: Đạt (@phatdat220707). Written by Đăng. Decisions D-14 to D-18 (`docs/coordination/decisions-needed.md`). The theme is on `main` from PR #37.
Paste everything below the line into your frontend-builder session.

---

You are the SLEUTH frontend engineer. PowerShell on native Windows, no `&&` chaining, English everywhere, no AI mentions in commits or docs. Repo: `C:\Data\Singapore\SMU\Sleuth\sleuth`. Never push to `main`. One branch and one PR per screen. **UI freeze: Sun 29 Nov.**

## What is already on `main` (PR #37, do not redo)

- `apps/web/styles/tokens.css`: theme `hollow` (default) and `midnight` (fallback). Roll back with one line: `data-theme="midnight"` in `apps/web/app/layout.tsx`.
- `apps/web/styles/globals.css`: the token classes. Existing: `bg-background`, `bg-surface`, `bg-raised`, `border-line`, `text-foreground`, `text-muted`, `bg-primary`, `text-on-primary`, `text-warn`, `text-danger`, `text-ok`. New: `border-line-strong`, `text-gold` / `border-gold` (the seal, proven items), `text-spectral` / `border-spectral` (AI candidates, never a verdict), `outline-focus`.
- Display serif: Instrument Serif with real italics, through `font-display`.
- Icons: `apps/web/components/icons/` (`FINDING_ICONS`, `LanternIcon`, `FilmReelIcon`, `WaxSealIcon`, `PlayIcon`, `PauseIcon`, `LockIcon`, `CheckIcon`, `ArrowUpRightIcon`, `ChevronIcon`, `CloseIcon`, `UploadIcon`, `FileIcon`). Decorative by default. Pass `title` only when no visible text sits beside the icon.
- `apps/web/components/icons/theme-foundations.test.tsx` fails on a raw hex colour in components, features or pages.

## Rules for every PR

- **Tokens:** token classes only. No raw hex, no new colour.
- **Contrast and size:** text at least 12 px and 4.5:1. Lines that carry meaning (inputs, selected state) at least 3:1, which means `border-line-strong`, not `border-line`.
- **Targets and motion:** click targets at least 24 by 24 px. Keep reduced motion and forced colours working. No flashing.
- **Copy and art (D-16, D-18):** plain QA copy. Every spooky label keeps its plain label. Original SVG or CSS art only.
- **Dependencies:** no new dependency.
- **Tests:** keep the e2e specs (`tests/e2e/*.spec.ts`) and the a11y spec (`tests/e2e/a11y.spec.ts`) green. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm exec playwright test --project=chromium --workers=1` before each push.

## Order (one PR each)

1. **Merge #27 first.** Merge `main` into `feat/web-anonymous-signin` (only the journal clashes: keep both sides), re-run the browser specs, get it merged. Rebase or merge `main` into every later branch after that.
2. **Fix the flaky test.** `apps/web/features/workspace/workspace-flow.test.tsx`, "moves the playhead and the slider together because they share one clock" failed once on `main`. The test checks `clockText()` and the playhead style right after `fireEvent.change`, with no wait. Wait for the update (`await waitFor(...)` or a `findBy...` query) instead of reading at once. Run the file 20 times in a row to show it is steady.
3. **Tokens in components.**
   - `apps/web/components/ui/button.tsx`: the `outline` variant uses `border-line`; switch it to `border-line-strong`.
   - Form inputs: switch from `border-line` to `border-line-strong`. They are in `features/checklist/checklist-editor.tsx`, `features/lantern/actions.tsx`, `features/player/simulated-clock.tsx`, `features/report/request-reshoot.tsx`, `features/report/seal-panel.tsx`, `features/script/script-editor.tsx`, `features/upload/upload-flow.tsx` and `features/workspace/workspace.tsx`.
   - Keep `border-line` for decorative lines only (about 45 uses today).
   - `apps/web/components/finding-badge.tsx`: keep "spooky name (plain name)". Add the finding icon from `FINDING_ICONS[type]`, and a shape per type, so a type never relies on colour alone.
4. **Dashboard.** `apps/web/app/(workspace)/page.tsx`, `features/dashboard/project-list.tsx`.
   - Add an eyebrow label and a display heading with an italic accent.
   - Show projects as cards.
   - Add five finding cards, one per finding type, each with icon, spooky name and plain name.
5. **Workspace.** `apps/web/app/(workspace)/projects/[id]/page.tsx`, `features/workspace/workspace.tsx`.
   - Add a coverage progress bar. Its label says "covered", never "confirmed".
   - The timeline (`features/timeline/timeline.tsx`) keeps its marker shapes.
   - The Evidence Lantern (`features/lantern/lantern.tsx`) is the detail panel.
   - Put Script, Checklist, Upload and Analysis in tabs (`features/workspace/editors-panel.tsx`, `analysis-panel.tsx`). Use an accessible tab pattern: arrow keys move between tabs, and Tab enters the panel.
6. **Report.** `apps/web/app/(workspace)/projects/[id]/report/page.tsx`, `features/report/report-view.tsx`, `seal-panel.tsx`, `seal-confirmation.tsx`.
   - Show a draft, sealed or broken banner, each with icon and text.
   - Use the seal panel with `WaxSealIcon` and `text-gold`.
   - **Print stays white:** the `@media print` block in `globals.css` already swaps the tokens. Check one printed page.
7. **Error pages.** Add `apps/web/app/not-found.tsx` and `apps/web/app/error.tsx` (a client component with a retry). Use plain copy, and a link back to the dashboard.

## Video player (inside the workspace PR, or its own PR)

- **Panel text:** `apps/web/features/player/no-video-panel.tsx` says "No video in fixture mode" on the Supabase site too. When nothing plays, say the project has no playable video file. Mention fixture mode only in fixture mode.
- **Real player:** wire it to `GET /api/v1/projects/{id}/assets/{assetVersionId}/playback-url`. It returns `{ url, expiresAt }`, or both `null` when nothing plays (the demo always gets `null`).
  - With a URL, use `features/player/html-player.tsx` (`HtmlVideoPlayer`).
  - With `null`, keep the simulated player and the panel.
  - Ask again after `expiresAt`. Never store the URL.
  - Add the method to `apps/web/lib/api-client.ts`, with tests.
- Then run the keyboard and caption checks in the a11y spec.

## Also yours

Clips 4 and 5 (evidence-analysis 14 and 15) stay with you. The recording kit for clip 5 is in `tests/evaluation/clips/clip-5/`. Đăng is preparing clips 1 to 3 (D-10).

## Done when (per PR)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.
- `pnpm exec playwright test --project=chromium --workers=1` passes, including `tests/e2e/a11y.spec.ts`.
- CI `check` and `db` are green.
- The theme test passes (no raw hex).
- A journal entry with the real numbers.
- One screenshot per screen in the PR description, in `hollow`.

## Do not

- Do not edit `apps/web/styles/tokens.css` or the contrast test. If a colour looks wrong, ask Đăng.
- Do not change contracts, the API or `packages/`.
- Do not touch `packages/domain/src/review.ts` or any code that sets evidence to `confirmed`.
- No raw hex, no new dependency, no gamified words.
