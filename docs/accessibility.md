# Accessibility check: review workspace

Owner: Đạt. Covers review-workspace task 14 (requirements 8.1 to 8.5).

Status: automated checks done on 2026-11-09. The manual screen-reader walkthrough is NOT done yet. Task 14 stays open until it is.

Automated checks cannot prove WCAG conformance. They find some problems only. Full validation needs manual testing with assistive technologies and a review by an expert.

## Automated results (2026-11-09, fixture mode)

Run: `pnpm exec playwright test tests/e2e/a11y.spec.ts --workers=1`. Result: 9/9 passed.

| Page | Axe tags | Serious or critical | Other violations | Needs review (axe "incomplete") |
|---|---|---|---|---|
| Dashboard | wcag2a, wcag2aa, wcag21a, wcag21aa | 0 | 0 | color-contrast: 6 nodes |
| Demo workspace, Lantern open (outside-proof line) | same | 0 | 0 | color-contrast: 1 node |
| Editable copy, Lantern with review actions | same | 0 | 0 | color-contrast: 1 node |

### The 8 color-contrast "incomplete" items (measured 2026-11-09)

Method: production build (`next start`, fixture mode), Chromium at 1280x900.
1. For each node axe left "incomplete", Kiro made the text transparent and took a screenshot of the element's box.
2. Kiro read every pixel of that screenshot. The darkest and lightest pixels are the real background range, including the fog and the translucent header.
3. Kiro computed the WCAG ratio of the computed text colour against both ends of that range.
4. The worst case is in the table. The AA minimum is 4.5:1 for normal text and 3:1 for large text (24 px, or 18.66 px bold).

| # | Page | Element (axe target) | Text | Axe reason | Text colour | Background measured | Worst ratio | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | Dashboard | header wordmark `.hover\:text-primary` | "SLEUTH", 24 px | background gradient (fog under translucent header) | #c4b5fd | rgb(22,17,38) to rgb(36,30,55) | 8.64:1 | Pass |
| 2 | Dashboard | header nav link `.hover\:text-foreground` | "Dashboard", 14 px | same | #b8aed1 | rgb(20,16,34) to rgb(47,41,62) | 6.64:1 | Pass |
| 3 | Dashboard | `h1` | "SLEUTH", 36 px | background gradient (fog) | #ece8f6 | rgb(13,10,21) to rgb(31,25,47) | 14.08:1 | Pass |
| 4 | Dashboard | intro `.mt-2` | 16 px muted | same | #b8aed1 | rgb(13,10,21) to rgb(28,23,43) | 8.30:1 | Pass |
| 5 | Dashboard | `#projects-heading` | "Projects", 24 px | same | #ece8f6 | rgb(13,10,21) to rgb(24,19,36) | 15.07:1 | Pass |
| 6 | Dashboard | `#legend-heading` | "What the findings mean", 24 px | same | #ece8f6 | rgb(13,10,21) to rgb(15,12,22) | 16.08:1 | Pass |
| 7 | Demo workspace (Lantern open) | script editor textarea (`#_r_2_`, a React id) | 14 px | "partially obscured by another element" | #ece8f6 | 84,315 of 84,320 pixels are #0e0b16. The other 5 pixels are the textarea's native resize grip in the corner, not behind text | 16.18:1 | Pass |
| 8 | Editable copy (review actions) | the same textarea | 14 px | same | #ece8f6 | same as 7 | 16.18:1 | Pass |

More evidence:
- For items 7 and 8, `document.elementFromPoint` at all four inside corners and at the centre of the textarea returns the textarea itself. Nothing covers it.
- With `prefers-reduced-motion: reduce`, the fog is hidden. The 6 dashboard items are then not reported at all; only the textarea is left, with the same result.
- No CSS change was needed. All 8 pass AA.

Limits of this check:
- Done at one viewport size, and at one moment of the fog animation. The fog drifts slowly (40 s cycle), so the background range can shift a little. The lowest margin is item 2, at 6.64:1 against a 4.5:1 minimum.
- Hover and focus colours were not measured here. The focus ring has its own test.
- Text inside images or the native file picker button was not measured.
- Windows High Contrast (forced colours) mode was not checked.

Also covered by `a11y.spec.ts`:

- Axe runs with motion on and with `prefers-reduced-motion: reduce`.
- Reduced motion: while the workspace loads, the fog is hidden and no element has a running CSS animation (this includes the skeleton pulse).
- Keyboard path:
  - The first Tab focuses the skip link, and Enter moves focus to `#main-content`.
  - Open demo works from the keyboard.
  - Tab enters the timeline toolbar. Right moves between markers and Enter chooses one. The clock then reads 11.0 s, focus is on line 3 and the Lantern shows line 3.
  - Escape returns focus to the script.
  - Enter on a script line seeks the clock.
  - The focused control has a solid outline of at least 2 px.
- Review actions, on an editable copy: Tab from "Play this part" reaches "Confirm evidence", and Enter confirms.

Other tests that cover task 14 requirements:

- `tests/e2e/focus.spec.ts`: the focus ring is visible right away and has at least 3:1 contrast, on desktop and mobile, with and without reduced motion.
- `apps/web/features/timeline/timeline.test.tsx`: every timeline key, roving tabindex, the polite live region and the marker names.
- `tests/e2e/investigation.spec.ts`: an older axe check of the workspace and a fog check.

## Final Seal report (Final Seal task 10, 2026-11-10, fixture mode)

Run: `pnpm exec playwright test tests/e2e/final-seal.spec.ts --workers=1`, which passed. The whole flow goes through the UI on a fresh editable copy:

1. Make an editable copy from the demo.
2. Confirm lines 1 to 3 in the Lantern, and mark line 5 as needing outside proof.
3. On the report, ask for a reshoot of the Ghost item ("Export the invoice as a PDF").
4. Sign off with the keyboard.
5. Edit one sentence in the script editor.
6. Back on the report, check that the seal is broken.

### Checked with Playwright (keyboard and DOM, not a screen reader)

| What | How it was checked | Result |
|---|---|---|
| Tab reaches "Apply the Final Seal" | Tab pressed from the skip link until the button had focus | Reached |
| Enter opens the confirm step and focus moves to "Note (optional)" | `toBeFocused` | Pass |
| Note typed with the keyboard, Tab to "Sign and seal", Enter sends it | The POST body had the note; 201 | Pass |
| Focus after a seal goes to the "Final Seal applied" group | `toBeFocused` | Pass |
| Live region | `role="status"`, `aria-live="polite"`, text "The Final Seal was applied. The report is now signed off." | Pass |
| Cancel and a refusal return focus to the button | Component tests | Pass |
| The open reshoot and the outside-proof line stay visible after signing, and are in the seal's snapshot | DOM and API | Pass |
| Broken seal banner after a sentence edit | "Seal broken: evidence changed after sign-off" | Pass |

### Axe on the copy's report (WCAG 2.0/2.1 A and AA tags)

| State | Serious or critical | Other violations | Needs review (axe "incomplete") |
|---|---|---|---|
| Seal button enabled | 0 | 0 | none |
| Confirm step open | 0 | 0 | color-contrast: 1 (the note textarea, "partially obscured") |
| After the seal | 0 | 0 | none |
| Broken seal | 0 | 0 | color-contrast: 5 (header wordmark, header "Dashboard" link, "Back to the workspace", h1, "Final Seal report" line; "background gradient", meaning the fog) |

Fixed in this pass: the first run found one serious issue, `link-in-text-block`. The "Open the workspace" links inside the blocker sentences were shown by colour only, with an underline only on hover. They are now always underlined. After the fix: 0 serious or critical issues.

The 6 "incomplete" items are the same kinds as the 8 measured on the dashboard and workspace, all of which passed, the lowest at 6.64:1:
- the same textarea style on a flat #0e0b16 background;
- the same text colours over the fog.

These 6 were not measured one by one on the report page.

### Still not checked

- What Narrator or NVDA actually says. Everything above is keyboard and DOM checking in Chromium; nothing was heard.
- Whether the live message is read once, and not interrupted by the focus move to the confirmation.
- High Contrast mode, browsers other than Chromium, and the wax-seal animation by eye.

Review Workspace task 14 stays open until the manual walkthrough is done.

## Manual walkthrough to do (Narrator or NVDA)

Use Windows 11, Chrome or Edge, and the production build:

```
pnpm build
pnpm --filter @sleuth/web exec next start
```

Open http://localhost:3000. Do the steps once with Narrator (Win+Ctrl+Enter) or NVDA. Note what was and was not heard.

1. Dashboard. Tab once. You should hear "Skip to main content, link". Press Enter. Focus should move to the main area.
2. Keep pressing Tab. Each control should be announced with a name: "SLEUTH home", "Dashboard", the project name, "Open demo: ProofPay demo (public example)", "Create a project".
3. Press Enter on Open demo. The page heading "ProofPay demo (public example)" should be readable with the heading key (H in NVDA browse mode).
4. Tab to the timeline. You should hear the toolbar name "Evidence markers", then one marker, for example "Evidence for line 1, 1 to 5 seconds, medium confidence, Cursed Frame, needs human check".
5. Press Right twice. Each move should announce "Marker 2 of 4" and then "Marker 3 of 4" (polite live region).
6. Press Enter. You should hear "Selected: Evidence for line 3 ...". Focus should land on script line 3, and its pressed state should be announced.
7. Press Escape on a marker. Focus should return to the script line.
8. Choose script line 4, which has no evidence. You should hear "Line 4 has no evidence, so the clock did not move."
9. Read the Evidence Lantern with the arrow keys. Every spooky label should be followed by its plain label, for example "Phantom Dialogue (Script line not spoken)". The confidence should read "A ranking, not proof."
10. Demo: the four decision buttons should be announced as unavailable (dimmed), and the reason "The demo project is read-only..." should be read as their description.
11. Press "Make an editable copy". In the copy, choose line 2, then "Confirm evidence". You should hear "Evidence for line 2 confirmed by you." without focus moving.
12. Choose "Needs reshoot". The "Reshoot note" field should be announced with its label.
13. Edit the script, save, and listen to the summary. Reorder a checklist item with Up and Down. You should hear "Moved ... Not saved yet."
14. Upload: the file picker should be announced with the limits text.
15. Run analysis. The queued status should be announced politely, and it should not repeat every 2 seconds.
16. Contrast: the 8 items axe could not decide were measured and pass (see the table above). By eye, still check two things: text on hover, and the page in Windows High Contrast mode (Settings, Accessibility, Contrast themes). In High Contrast mode, check that every button and the timeline markers can still be seen.
17. Final Seal report, on an editable copy with everything reviewed: Tab to "Apply the Final Seal" and press Enter. Focus should land on "Note (optional)". Type a note, Tab to "Sign and seal" and press Enter. You should hear "Final Seal applied" (the focus move) and "The Final Seal was applied. The report is now signed off." (the live region). Note whether you hear both, one, or one cut off.
18. Final Seal report with blockers: the disabled button should be announced as unavailable, followed by the blocker sentences (its description).

## Walkthrough log

Production build (`next start`, fixture mode) on 2026-11-09 from 13:26, at http://localhost:3000. An editable copy, "Narrator copy" (`/projects/proj-1`), was created through the API for group 3.

### Group 1: dashboard and skip link (keyboard check in Chrome/Playwright; Narrator speech not yet confirmed)

Reported by Đạt as a keyboard and visual check in the browser:

| Step | Key | Observed |
|---|---|---|
| 1 | Tab | Focus on "Skip to main content" |
| 2 | Enter | Focus moves into the main region |
| 3 to 5 | Tab | In order: "Narrator copy", "ProofPay demo (public example)", "Open demo", "Create a project". The new copy is listed first because the list is newest first. |
| All | | Each control has an accessible name and a 2 px amber focus ring |
| 6 | Shift+Tab | Back into the header: "Dashboard" comes before "SLEUTH home", which matches the reversed tab order |

Not yet confirmed: what Narrator actually says for steps 1 to 7, including heading navigation (`Caps Lock + H`).

## Known gaps

- The manual screen-reader pass (steps above) has not been done.
- The 8 color-contrast items axe marked "incomplete" were measured on 2026-11-09 and pass (lowest 6.64:1). Hover colours and High Contrast mode were not checked.
- The real HTML video player is not wired yet, because the API has no playable video URL. Its keyboard and caption behaviour is not checked.
- Focus goes to the script line when a marker is chosen (task 8 acceptance), not to the Lantern heading as the design text says. This is not decided yet.
- Requirement 8.5 (AA contrast everywhere, including over fog) is only partly checked: by axe, and by the focus-ring test for focus rings.
