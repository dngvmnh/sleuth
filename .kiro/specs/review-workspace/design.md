# Review workspace: design

## Where things are today

- `apps/web/app/(workspace)/page.tsx`: home page listing projects and the finding legend (server component, reads the store directly).
- `apps/web/lib/api-client.ts`: typed client with `listProjects`, `createProject`, `getProject`, `listEvidence`, `listFindings`, `reviewEvidence`. It needs `createUploadUrl`, `createScript`, `setChecklist`, `startAnalysis`, `getJob`, `createReshoot` added (task 2).
- `apps/web/styles/tokens.css` and `globals.css`: tokens, fog and glow with reduced-motion handling.
- `apps/web/components/ui/button.tsx`: shadcn-style button.
- Fixture mode: demo project is read-only; `createProject(name, true)` gives an editable copy; `x-fixture-user` header switches users.
- Pure rules the UI must reuse, not re-implement: `FINDING_LABELS` (contracts), `deriveSegmentStates` (domain, change-impact task 2), `applyReviewDecision` (the server runs it; the UI only calls the endpoint).

## Routes

```
/                          dashboard (project list)
/projects/[id]             workspace (the Screening Room)
/projects/[id]/report      final seal (final-seal spec)
```

Folders (frontend-owned): `app/(workspace)/`, `components/`, `features/`, `styles/`, `lib/`.

```
features/workspace/
  use-project.ts           loads project, evidence, findings; exposes refresh and mutations
  use-job-poll.ts          polls a job every 2 s until done or failed
  workspace.tsx            layout: player + timeline on top, sentences left, lantern right
features/timeline/
  geometry.ts              msToPercent, percentToMs, clamp          (pure, property tested)
  segment-at.ts            segmentAtMs(intervals, ms)               (pure, property tested)
  timeline.tsx             markers, keyboard navigation, live region
features/player/
  player-port.ts           interface PlayerPort { currentMs, seek(ms), play(), pause(), durationMs, on(change) }
  html-player.tsx          adapter for a real <video>
  simulated-player.ts      adapter with a manual clock for fixture mode and tests
features/script/           sentence list, editor, diff summary
features/checklist/        checklist editor
features/lantern/          Evidence Lantern panel and Exorcism actions
features/upload/           file picker, duration check, upload progress
components/                small shared pieces (FindingBadge, LiveRegion, StatePanel)
```

## State

No new state library at first. Each feature uses React state plus the typed client. `use-project` keeps `{ detail, evidence, findings, status }` and exposes `review(evidenceId, decision)` which calls the endpoint, then replaces the returned evidence in state and reloads findings (the server resolves linked findings). If the team later wants caching, add TanStack Query in one PR; nothing else needs to change because components only use the hooks.

## Player port

The workspace talks to a `PlayerPort`, never to `<video>` directly. This makes three things possible:
- fixture mode has no video file, so a `SimulatedPlayer` with play/pause and a draggable clock keeps the whole flow demonstrable and testable;
- unit tests drive time without media;
- a real adapter wraps `HTMLVideoElement` (`currentTime`, `timeupdate`, `seeked`).

## Timeline

Positions come from `geometry.ts` only. Markers are `<button role="button">` elements inside a `role="toolbar"` container with roving tabindex, so Tab enters once and arrow keys move. Each marker's accessible name reads like: "Evidence for line 3, 11 to 18 seconds, medium confidence, needs review". Marker shape (not just colour) varies by state: filled circle covered, hollow circle needs review, dashed outline stale, diamond outside proof, no marker for uncovered (the sentence list shows a Ghost badge instead).

Sentence highlight while playing uses `segmentAtMs` on the evidence intervals, updated on `timeupdate` (throttled) and on seek.

## Evidence Lantern

A side panel (a `<section aria-labelledby>`), not a modal, so keyboard users keep their place. Sections in order: label (spooky + plain), explanation, found / not found / limits as a definition list, confidence with the text "a ranking, not proof", time range, action row. Focus moves to the panel heading when a marker is activated by keyboard, and back to the marker on Escape.

## Exorcism

Four buttons with plain names (Confirm evidence, Reject, Needs reshoot, Needs outside proof). Needs reshoot opens an inline note field and then calls `createReshoot` and `reviewEvidence`. There is no bulk action (6.5). While a request runs the buttons are disabled and a polite status is announced. Server errors (409 `review_refused`) are shown as text with `role="alert"`.

## States

A `StatePanel` component renders loading skeleton, empty, processing (job status and attempt, no spinner-only), failed (error text and retry), done. Skeletons respect reduced motion (no shimmer).

## Accessibility and motion

- `LiveRegion` component with `aria-live="polite"` for selection and action results.
- Focus ring from `:focus-visible` token; never remove outlines.
- Reduced motion: tokens.css already disables fog and glow; marker pulse uses the `sleuth-glow` class, so the same rule applies.
- Automated: `@axe-core/playwright` in the e2e tests. Manual: one pass with Windows Narrator or NVDA recorded in the journal.

## Testing

- Unit and property tests (Vitest) for `geometry.ts` and `segment-at.ts`.
- Component tests need `jsdom` and `@testing-library/react` (Đạt adds them in task 1; one person at a time edits the lockfile).
- Playwright: dashboard, open demo, copy demo, review flow, keyboard timeline, reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })` and assert the fog is hidden), axe.

## Open questions

- No video file is committed. The recorded clips from evidence-analysis task 11 can back a real demo later; the real adapter must work with them.
- Whether to add a minimal sign-in UI beyond anonymous sign-in. Not for the MVP.
