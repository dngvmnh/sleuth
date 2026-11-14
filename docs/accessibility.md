# Accessibility check: review workspace

Owner: Đạt. Covers review-workspace task 14 (requirements 8.1 to 8.5).

Status: automated checks done on 2026-11-09. A Narrator walkthrough was run on 2026-11-11 and compared against the Speech recap transcript (see "Narrator walkthrough log"). Step 18 failed and was fixed in code. Đạt heard the fix with Narrator on 2026-11-13 and it passes. Hover contrast was measured and High Contrast mode was checked on 2026-11-13; two High Contrast problems were fixed. Đạt checked Narrator heading navigation (H and Shift+H) on 2026-11-13 and it passes. Step 15 was checked by ear on 2026-11-13: the queued message was read in full once and not repeated. Step 17 was checked by ear on 2026-11-13: both seal messages were heard. All 18 walkthrough steps now have a result; the remaining gaps are listed under "Known gaps". Review Workspace task 14 was ticked on 2026-11-13 against its "Done when" criteria (axe: no serious or critical issues; this doc lists the known gaps).

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
- Hover and focus colours were not measured here. The focus ring has its own test. Hover was measured later, on 2026-11-13 (see "Hover contrast").
- Text inside images or the native file picker button was not measured.
- Windows High Contrast (forced colours) mode was not checked here. It was checked on 2026-11-13 (see "Windows High Contrast").

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

The manual walkthrough was done later (2026-11-11 and 2026-11-13). See the Narrator log below.

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
   **Turn Scan mode off first (Narrator key + Space).** With Scan mode on, Narrator keeps the arrow keys for itself: Right reads the marker's label one character at a time and the timeline never sees the key. With Scan mode off, Right, Left, Home, End, Enter and Escape reach the timeline. Turn Scan mode back on to read the Lantern (step 9). NVDA users switch to focus mode (NVDA + Space) instead.
5. Press Right twice. Each move should announce "Marker 2 of 4" and then "Marker 3 of 4" (polite live region).
6. Press Enter. You should hear "Selected: Evidence for line 3 ...". Focus should land on script line 3, and its pressed state should be announced.
7. Press Escape on a marker, with Scan mode off. Focus should return to the script line.
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

Not yet confirmed here: what Narrator actually says for steps 1 to 7. Steps 1 to 7 were later read from the Speech recap (2026-11-11). Heading navigation was checked by Đạt (2026-11-13; see "Narrator heading navigation").

## Narrator walkthrough log (2026-11-11)

Setup: Windows, Microsoft Edge, Narrator. SLEUTH production build (`next start`) in fixture mode, at commit `c737231`.

Who ran it: an agent pressed the keys. Evidence: screenshots of Narrator's Speech recap window. Nobody listened by ear. So the speech is checked as text only. Timing, cut-off speech and overlapping speech are not checked.

For step 17, the project was a fixture copy set up through the local API so nothing blocked the seal.

| Step | What was done | Text in Speech recap (what Narrator said) | Result |
|---|---|---|---|
| 1 | Tab, then Enter on the skip link | "Skip to main content"; Enter moved to the main landmark | Pass |
| 2 | Tab through the dashboard | Link and button names are in the recap | Pass |
| 3 | Open demo | "ProofPay demo (public example), heading level 1" | Pass |
| 4 | Tab into the timeline | Toolbar name, then the marker's line, time, confidence and state | Pass |
| 5 | Right, twice | With Scan mode **on**: Right read the label one character at a time. With Scan mode **off**: "Marker 2 of 4", "Marker 3 of 4" | Pass with Scan mode off (instructions added to step 4) |
| 6 | Enter on marker 3 | Clock went to 11 s, focus went to script line 3, read as "on" (pressed). An extra try on marker 1 gave the full "Selected: Evidence for line 1..." | Pass |
| 7 | Escape on a marker, Scan mode off | Focus went back to the script line | Pass |
| 8 | Choose line 4 | "Line 4 has no evidence, so the clock did not move."; the clock did not move | Pass |
| 9 | Read the Lantern | Each spooky label had its plain label next to it; "A ranking, not proof." | Pass |
| 10 | Decision buttons on the demo | All four read as disabled, with "The demo project is read-only. Make an editable copy to review evidence." | Pass |
| 11 | Confirm on the copy | "Evidence for line 2 confirmed by you." | Pass |
| 12 | Needs reshoot | "Reshoot note, edit" | Pass |
| 13 | Save the script; reorder the checklist | A summary of the version, the changed sentences and the stale evidence; "Moved ... to position 2. Not saved yet." | Pass |
| 14 | File picker | Read with the limits: one English video, up to 180 seconds, a plain-text script | Pass |
| 15 | Run analysis, wait about 12 s | One queued message and the polling explanation. The status was not repeated on each poll in the transcript | Pass (text). **Pass by ear on 2026-11-13** (Đạt): read in full once, not repeated over about 10 s (see below) |
| 16 | Hover contrast, High Contrast mode | Done on 2026-11-13 without Narrator (see "Hover contrast" and "Windows High Contrast" below) | Hover: Pass (measured). High Contrast: 2 problems found and fixed, then Pass in a real contrast theme |
| 17 | Seal with the keyboard | Focus went to Note; Tab and Enter signed it. Both "Final Seal applied" and "The Final Seal was applied. The report is now signed off." are in the recap | Pass (text). **Pass by ear on 2026-11-13** (Đạt): both messages heard (see below) |
| 18 | Tab to the disabled seal button | "Apply the Final Seal, button, The Final Seal is not available yet What blocks the Final Seal, disabled." The blocker sentences were read only when browsing into the list | **Fail** on 2026-11-11, fixed in code. **Pass** on 2026-11-13, heard by Đạt (see below) |

### Step 15 by ear (2026-11-13)

Đạt listened directly with Narrator on an editable fixture copy (`proj-5`, production build). After pressing "Run analysis", Đạt waited about 10 seconds.

What Đạt confirmed:
- The queued message was read in full, once.
- It was not repeated during the polling, which checks every 2 seconds.

Source: what Đạt heard and reported, not a verbatim transcript.

What this does not cover:
- Whether other speech, such as the button or the focus, overlapped with the message. Đạt did not report on that.
- Waits longer than about 10 seconds.

### Step 17 by ear (2026-11-13)

Setup:
- An editable fixture copy, production build, made ready to seal through the local API, as in `seal.spec.ts`.
- The agent confirmed the candidates for lines 1 to 3. This is test setup, not a real review.
- Line 5 was marked as needing outside proof, and a reshoot was asked for the Ghost item.
- The copy was not signed beforehand. Đạt signed it with the keyboard.
- Three copies were signed: `proj-9`, `proj-18` and `proj-27`, all with the note "Accessibility check". Đạt missed the speech on the first two, and they were left as they were. Đạt has not confirmed which copy ID the heard run was on.

What Đạt confirmed, listening directly with Narrator after signing, was that both messages were heard:
- "Final Seal applied." (the focus move to the confirmation)
- "The Final Seal was applied. The report is now signed off." (the polite live region)

Source: what Đạt heard and reported, not a verbatim transcript.

### Step 18: cause and fix

Cause: the button's `aria-describedby` pointed at a wrapper `div`. The wrapper held the intro line and a list with `aria-label="What blocks the Final Seal"`. To build the description, the browser walks the wrapper's contents. When it reaches the list, it uses the list's `aria-label` instead of the list items (the accessible-name rules). So Edge gave Narrator the label, not the reasons.

Fix (`apps/web/features/report/seal-panel.tsx`): `aria-describedby` now lists the intro line and one `span` per blocker sentence. The description is now "The Final Seal is not available yet: <each blocker sentence>". It no longer contains the list label or the "Open the workspace" links. The list keeps its label for people who browse into it.

Tests: `seal-panel.test.tsx` ("describes the disabled button with the blocker sentences, not the list's label") and `tests/e2e/seal.spec.ts` (accessible description in Chromium).

Re-check after the fix (2026-11-13): **Pass.** Đạt listened to Narrator directly on a copy whose seal was still blocked. On reaching the disabled "Apply the Final Seal" button, Narrator read both reasons: some evidence candidates have not been confirmed or rejected, and some checklist items have no usable evidence. Source: what the user heard and reported. The exact words were not captured, so this is not a verbatim transcript.

## Hover contrast (2026-11-13)

Setup: production build (`next start`, fixture mode), Playwright Chromium at 1280x900, motion on (fog present). An agent ran it.

Method (same as the 2026-11-09 pass):
1. Move the mouse onto the control and wait 400 ms. `transition-colors` takes 150 ms.
2. Read each text element's computed hover colour.
3. Make the text transparent. Screenshot only the text's own line box, so borders and rounded corners are left out.
4. Read every pixel. Use the darkest and lightest as the background range.
5. Compute the WCAG ratio at both ends and keep the worst.

The AA minimum is 4.5:1 for normal text, and 3:1 for large text (24 px, or 18.66 px bold). Every control was still `:hover` when it was measured.

| Page | Control | Text size | Hover text colour | Background measured | Worst ratio | Need | Result |
|---|---|---|---|---|---|---|---|
| Dashboard | Header wordmark "SLEUTH" | 24 px | #a78bfa | rgb(23,18,38) to rgb(24,18,39) | 6.68:1 | 3:1 | Pass |
| Dashboard | Header "Dashboard" link | 14 px | #ece8f6 | rgb(20,16,34) | 15.48:1 | 4.5:1 | Pass |
| Dashboard | Project title link | 20 px | #c4b5fd | rgb(23,18,37) | 9.89:1 | 4.5:1 | Pass |
| Dashboard | Open demo | 14 px | #ece8f6 | rgb(33,26,54) | 13.78:1 | 4.5:1 | Pass |
| Dashboard | Create a project (primary) | 14 px | #0e0b16 | rgb(196,181,253) | 10.55:1 | 4.5:1 | Pass |
| Workspace (copy) | Back to dashboard | 14 px | #c4b5fd | rgb(29,23,44) to rgb(32,25,48) | 9.15:1 | 4.5:1 | Pass |
| Workspace (copy) | Open the Final Seal report | 14 px | #c4b5fd | rgb(23,18,35) to rgb(24,19,37) | 9.82:1 | 4.5:1 | Pass |
| Workspace (copy) | Play simulated clock (outline) | 14 px | #ece8f6 | rgb(33,26,54) | 13.78:1 | 4.5:1 | Pass |
| Workspace (copy) | Script line 4, unselected: number / sentence / badge | 14 / 14 / 12 px | #b8aed1 / #ece8f6 / #b8aed1 | rgb(33,26,54) | 7.91 / 13.78 / 7.91:1 | 4.5:1 | Pass |
| Workspace (copy) | Lantern: Play this part, Reject (outline) | 14 px | #ece8f6 | rgb(33,26,54) | 13.78:1 | 4.5:1 | Pass |
| Workspace (copy) | Lantern: Confirm evidence (primary) | 14 px | #0e0b16 | rgb(196,181,253) | 10.55:1 | 4.5:1 | Pass |
| Report (copy) | Back to the workspace | 14 px | #c4b5fd | rgb(23,18,35) to rgb(25,20,38) | 9.73:1 | 4.5:1 | Pass |
| Report (copy) | Ask for a reshoot, Print (outline); Download CSV, Open printable HTML | 14 px | #ece8f6 | rgb(33,26,54) | 13.78:1 | 4.5:1 | Pass |
| Report (copy) | Blocker link "Open the workspace" | 14 px | #c4b5fd | rgb(23,18,37) | 9.89:1 | 4.5:1 | Pass |

The lowest is 6.68:1 for large text (the wordmark) and 7.91:1 for normal text. No change was needed.

What was not measured:
- Disabled buttons: they have `pointer-events: none`, so they have no hover state.
- "Needs reshoot" and "Needs outside proof": they use the same outline style as Reject, which was measured.
- Hover was checked at one viewport size and one moment of the fog animation.

## Windows High Contrast (2026-11-13)

Done by an agent, without Narrator.

Settings before the check:
- Contrast themes: "None". The high-contrast flag was off (`SPI_GETHIGHCONTRAST` flags 126).
- Theme: `Custom.theme`.

Theme used: **Night sky**, applied in Settings, Accessibility, Contrast themes. Windows reported the high-contrast flag on (flags 127, `hc2.theme`).

How it was checked:
- Microsoft Edge with the production build: a screenshot of the workspace, plus focus moved onto marker 1.
- Playwright Chromium, headed, with forced-colors emulation switched off (`forcedColors: null`). The page then reads the real Windows setting: `(forced-colors: active)` was true, the canvas was black and the text white.
- Note: Playwright's default (`forcedColors: "none"`) hides the contrast theme. A first run with that default is not counted.

| What | Found | Result |
|---|---|---|
| Text, headings, links, badges, cards | All readable in the theme's colours (Edge and Chromium) | Pass |
| Buttons | Outlined in the theme's button colour; disabled "Apply the Final Seal" shown dimmed | Pass |
| Timeline markers | All visible, each with a border; the shapes still tell the states apart (circle, diamond) | Pass |
| Focus ring | Visible on markers, on script lines and on "Confirm evidence" (Edge and Chromium) | Pass |
| **Chosen marker and chosen script line** | Looked the same as the others: the theme gives every border the same colour and drops the raised background | **Fail, fixed** |
| **Playhead and marker range bars** | Gone: they were drawn with `background-color`, which the theme removes | **Fail, fixed** |
| Report page (coverage, findings, reshoots, seal, export) | Readable, buttons outlined | Pass |

Fixes:
- `apps/web/features/timeline/timeline.tsx`: the chosen marker gets `forced-colors:border-[3px] forced-colors:border-double`. This is a shape cue, not a colour cue. The playhead and the range bars are now drawn with a border instead of a background, and look the same without a contrast theme.
- `apps/web/features/script/sentence-list.tsx`: the chosen line gets the same double border.

Re-check after the fixes, in the real Night sky theme: the chosen marker had a double border (2.4 px) and the others a single one. The chosen line had a double border too. The playhead and the range bars were visible.

Test: `tests/e2e/a11y.spec.ts`, "contrast theme (forced colors)". It uses Playwright's forced-colors emulation, so it can run anywhere.

Settings after the check: Contrast themes back to "None", flags 126, `Custom.theme`. These are the same as before.

Not checked:
- The other contrast themes (Aquatic, Desert, Dusk).
- The wax-seal stamp after signing.
- The pages at mobile width.

## Narrator heading navigation (2026-11-13): Pass

**Pass.** Source: Đạt checked it directly with Narrator in Scan mode on 2026-11-13. H moved to the next heading and read its name correctly. Shift+H moved back to the previous heading and read it correctly. These results are what Đạt heard and reported, not a verbatim transcript.

Earlier the same day, the agent tried and could not do it from its own session:
- The agent's desktop tool could not keep a handle on Edge's web content, so the keys were never sent to the page.
- Narrator's speech cannot be captured from this session. The Speech recap text is not readable, and the Narrator key cannot be held down.

The Pass above comes only from Đạt's own check.

## Production axe and Lighthouse (2026-11-14, after brief 007)

Pages: the dashboard, the demo workspace, the demo report and the 404 page, each at 1440x900 and 375x812, signed out. Axe ran through Playwright with the WCAG 2.0/2.1 A and AA tags plus best-practice. Lighthouse 12.8.2 (axe-core 4.14) ran in its mobile preset (slow 4G, 4x CPU slowdown) and its desktop preset.

**Before** is the live site, https://sleuth-eight.vercel.app, at `827a2a6`. The PR preview needs a Vercel login, so **after** is a local production build (`next build`, `next start`, fixture mode) of branch `fix/prod-a11y-perf`. A local build of `main`, measured the same way, gave close to the live numbers (dashboard mobile perf 58 vs 60), so the two columns compare fairly. Replace the after column with live numbers once this is deployed.

### Axe, serious and critical

| Page | Before | After |
|---|---|---|
| Dashboard, both sizes | none | none |
| Workspace, both sizes | none | none |
| Report, 1440 | none | none |
| Report, 375 | serious: `scrollable-region-focusable` (the coverage table's sideways scroll box) | none |
| 404, both sizes | none | none |

### Lighthouse scores (performance / accessibility / best practices / SEO)

| Page | Preset | Before (live) | After (local build) |
|---|---|---|---|
| Dashboard | mobile | 60 / 100 / 96 / 100 | 73 / 100 / 100 / 100 |
| Dashboard | desktop | 75 / 100 / 96 / 100 | 78 / 100 / 100 / 100 |
| Workspace | mobile | 78 / 100 / 96 / 100 | 70 / 100 / 100 / 100 |
| Workspace | desktop | 92 / 100 / 96 / 100 | 99 / 100 / 100 / 100 |
| Report | mobile | 79 / 100 / 96 / 100 | 74 / 100 / 100 / 100 |
| Report | desktop | 93 / 100 / 96 / 100 | 98 / 100 / 100 / 100 |
| 404 | both | not scored | not scored |

Lighthouse will not score a page that answers with HTTP 404, so the 404 page is covered by axe only.

The mobile performance score moves several points between identical runs. Repeated runs of the workspace on mobile gave total blocking time of 990 to 1,490 ms on `main` and 950 to 1,280 ms on the branch, so the workspace and report mobile "after" numbers above are within that noise.

### Main metrics

| Page | Preset | Layout shift before → after | Total blocking time before → after |
|---|---|---|---|
| Dashboard | mobile | 0.111 → 0.003 | 3,050 ms → 700 ms |
| Dashboard | desktop | 0.103 → 0.002 | 460 ms → 500 ms |
| Workspace | desktop | 0.165 → 0.003 | 30 ms → 40 ms |
| Report | desktop | 0.164 → 0.003 | 30 ms → 120 ms |

### What was fixed

- **Scroll box on the report** (axe, serious): the coverage table's sideways scroll area is now a focusable, named region, so keyboard users can scroll it.
- **Label in name** (Lighthouse, WCAG 2.5.3): the claims-map rooms had an `aria-label` that did not hold their visible words in the same case. The rooms now take their name from their text, with the punctuation and the word "Checklist" for screen readers only.
- **Layout shift**: the footer jumped down when a page's data arrived (`main` is now at least one screen tall). The dashboard hero now holds the places of the demo button, the coverage line and the clue card from the first paint. The fallback serif is sized to match Instrument Serif.
- **Main-thread time on the dashboard**: the bat and the lit-window glow were animated inside the hero SVG, next to its blur filters, so the whole picture was redrawn on every frame. The bat now flies on its own small layer, and the window and the mist at the foot of the hill are still. The waiting rooms' glow fades a separate layer instead of animating a box shadow.
- **Console error** (best practices 96 → 100): `/favicon.ico` was missing. The app now has `app/icon.svg`, an original key mark.

### Left as is

- Unused and legacy JavaScript (about 106 KiB and 14 KiB): these are framework bundles, and removing them is not cheap.
- Mobile largest contentful paint is about 3.4 s on the throttled preset. It is the first text block, which waits for the page's JavaScript and data.

## Known gaps

- All screen-reader results come from one person (Đạt) using Narrator in Microsoft Edge on Windows. NVDA, JAWS and other browsers were not used.
- Step 15 was checked by ear for "read in full once, not repeated". Overlap with other speech was not reported.
- Step 17 was checked by ear for "both messages heard". Their order and any overlap between them were not reported.
- The other contrast themes and mobile width in a contrast theme were not checked.
- The 6 axe "incomplete" colour-contrast nodes on the report page were not measured one by one. They are the same kinds as the 8 that were measured and passed.
- The real HTML video player is not wired yet, because the API has no playable video URL. Its keyboard and caption behaviour is not checked.
- Focus goes to the script line when a marker is chosen (task 8 acceptance), not to the Lantern heading as the design text says. This is not decided yet.
- Requirement 8.5 (AA contrast everywhere, including over fog) is only partly checked. It was checked by axe, by the focus-ring test, and by pixel measurement of the axe "incomplete" items and of hover states, at one viewport size and one moment of the fog animation. It is not proven for every state.
