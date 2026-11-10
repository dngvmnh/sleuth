# Review workspace: tasks

All tasks are Đạt's (@phatdat220707), half a day or less, and run against fixture mode with no keys. Work only in the frontend folders (`app/(workspace)/`, `components/`, `features/`, `styles/`, `lib/`, `tests/e2e/`). If a task needs a contract or API change, stop and ask Đăng. After every task: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:property`, and `pnpm test:e2e` for tasks that touch pages.

- [x] 1. Test tooling for components
  - Owner: Đạt
  - Files: `package.json` (root dev dependencies), `vitest.config.ts`, `apps/web/features/example.test.tsx` (delete after)
  - Do: add `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@axe-core/playwright` with exact versions; configure Vitest to use jsdom for `apps/web/**/*.test.tsx` only. Tell the team before touching the lockfile.
  - Done when: a trivial component test passes and `pnpm test` stays green. Shared files: needs Đăng's review.
  - Requirements: 8.5

- [x] 2. Complete the API client
  - Owner: Đạt
  - Files: `apps/web/lib/api-client.ts`, `apps/web/lib/api-client.test.ts`
  - Do: add `createUploadUrl`, `createScript`, `setChecklist`, `startAnalysis`, `getJob`, `createReshoot`; each parses the response with its contract schema; test with a fake `fetch`.
  - Done when: every endpoint in `ENDPOINTS` that returns JSON has a client method and a test, including the error shape.
  - Requirements: 1 to 7

- [x] 3. App shell and dashboard
  - Owner: Đạt
  - Files: `apps/web/app/(workspace)/layout.tsx`, `apps/web/app/(workspace)/page.tsx`, `apps/web/components/state-panel.tsx`, `apps/web/features/dashboard/*`
  - Do: Midnight Screening Room shell (header, nav, skip link, fog layer); project list with loading, empty and error states; demo button; "Create a project" using copy-from-demo in fixture mode.
  - Done when: Playwright opens the dashboard as a visitor and opens the demo; the three list states are covered by component tests.
  - Requirements: 1.1 to 1.3, 7.1

- [x] 4. Pure timeline helpers
  - Owner: Đạt
  - Files: `apps/web/features/timeline/geometry.ts`, `segment-at.ts`, `geometry.property.test.ts`, `segment-at.property.test.ts`
  - Do: `msToPercent`, `percentToMs`, `segmentAtMs` as designed.
  - Done when: both property tests pass (4.4 and 4.5).
  - Requirements: 4.4, 4.5

- [x] 5. Player port and simulated player
  - Owner: Đạt
  - Files: `apps/web/features/player/player-port.ts`, `simulated-player.ts`, `html-player.tsx`, tests
  - Do: interface and both adapters; the simulated player has play, pause, seek and a tick function for tests; a panel explains there is no video in fixture mode.
  - Done when: tests drive time and seeks with the simulated player; the HTML adapter has a test with a stub element.
  - Requirements: 4.8

- [x] 6. Workspace data hook and page skeleton
  - Owner: Đạt
  - Files: `apps/web/app/(workspace)/projects/[id]/page.tsx`, `apps/web/features/workspace/use-project.ts`, `workspace.tsx`, tests
  - Do: load detail, evidence, findings; expose `review`, `refresh`; layout with player, timeline, sentence list and lantern slots.
  - Done when: the demo project renders its script, evidence count and findings; errors and empty states show.
  - Requirements: 7.1

- [x] 7. Timeline component with keyboard support
  - Owner: Đạt
  - Files: `apps/web/features/timeline/timeline.tsx`, `timeline.test.tsx`, `apps/web/components/live-region.tsx`
  - Do: markers with shape and name by state using `deriveSegmentStates`; roving tabindex; Left, Right, Home, End, Enter, Escape; polite live announcements.
  - Done when: user-event tests cover every key; Playwright checks the toolbar is reachable with Tab and arrows.
  - Requirements: 4.1, 4.6, 4.7, 8.1 to 8.3
  - Depends on: change-impact task 2 (`deriveSegmentStates`). Until it lands, stub the function in `features/timeline/state.ts` with the same signature and delete the stub after.

- [x] 8. Sentence list synced with the timeline
  - Owner: Đạt
  - Files: `apps/web/features/script/sentence-list.tsx`, tests
  - Do: numbered sentences with state badges and Ghost badges; click seeks; marker click scrolls and highlights; playing highlights the current sentence with `segmentAtMs`.
  - Done when: Playwright clicks a sentence and the simulated clock moves; clicks a marker and the sentence is focused and in view.
  - Requirements: 4.2 to 4.4

- [x] 9. Evidence Lantern panel
  - Owner: Đạt
  - Files: `apps/web/features/lantern/lantern.tsx`, `apps/web/components/finding-badge.tsx`, tests
  - Do: panel as designed; spooky plus plain labels from `FINDING_LABELS`; confidence text "a ranking, not proof"; outside-proof message; "Play this part".
  - Done when: component tests assert every label pair and the three explanation parts appear; no text says "confirmed" for a `candidate`.
  - Requirements: 5.1 to 5.4

- [x] 10. Exorcism actions and reshoot note
  - Owner: Đạt
  - Files: `apps/web/features/lantern/actions.tsx`, tests, `tests/e2e/review.spec.ts`
  - Do: four actions, inline reshoot note, disabled states with reasons, server error display, announcements, no bulk action.
  - Done when: Playwright on an editable copy confirms one item, rejects another, and sees a refused action show the server message.
  - Requirements: 6.1 to 6.5

- [x] 11. Script and checklist editors
  - Owner: Đạt
  - Files: `apps/web/features/script/script-editor.tsx`, `apps/web/features/checklist/checklist-editor.tsx`, tests
  - Do: save script, show diff and stale list from the response; checklist add, remove, reorder; read-only demo with "Make an editable copy".
  - Done when: editing one sentence on a copy shows exactly one affected line; a punctuation-only edit shows "no evidence affected".
  - Requirements: 3.1 to 3.5

- [x] 12. Upload flow
  - Owner: Đạt
  - Files: `apps/web/features/upload/upload-flow.tsx`, `duration.ts`, tests
  - Do: file picker with limits text, duration read in the browser, refuse above 180 seconds, request URL, upload with progress (fixture mode skips the byte upload and says so), retry that keeps entered data.
  - Done when: a 200-second file is refused with the limit message; a failed upload keeps the script and checklist.
  - Requirements: 2.1 to 2.4

- [x] 13. Job polling and workspace states
  - Owner: Đạt
  - Files: `apps/web/features/workspace/use-job-poll.ts`, `apps/web/components/state-panel.tsx`, tests
  - Do: poll every 2 s, stop at done or failed, processing panel with attempts, failed panel with retry, done summary of items needing a person. Use fake timers in tests.
  - Done when: tests cover queued to running to succeeded and queued to failed to retry.
  - Requirements: 7.2 to 7.4

- [ ] 14. Accessibility and motion pass
  - Owner: Đạt
  - Files: `tests/e2e/a11y.spec.ts`, `docs/accessibility.md`
  - Do: axe scan of dashboard, workspace and lantern; reduced-motion test; a manual Narrator or NVDA walkthrough noted in the doc with what was and was not checked.
  - Done when: axe reports no serious or critical issues; the doc lists known gaps honestly.
  - Requirements: 8.1 to 8.5
