# Review workspace: requirements

Owner: Đạt (@phatdat220707). The Midnight Screening Room: dashboard, upload flow, script and checklist editor, synchronised video player and timeline, Evidence Lantern panel, Exorcism actions, every state, keyboard and screen-reader support.

Everything is built against the typed client in `apps/web/lib/api-client.ts` and fixture mode (`SLEUTH_DATA_MODE=fixture`). Fixture mode needs no keys. The demo project is read-only; use `createProject(name, true)` (copy from demo) to get an editable project. The visual direction and accessibility rules are in `.kiro/steering/frontend.md` and apply to every criterion.

`[PBT]` marks a criterion that a fast-check property test must cover. These are all on pure helper functions in `apps/web/features/`; component behaviour is covered by example tests and Playwright.

## 1. Dashboard

1.1 WHEN a visitor opens `/` without signing in, THE SYSTEM SHALL show the public demo project and a button to open it.

1.2 WHEN a signed-in user has projects, THE SYSTEM SHALL list them with name, number of open findings and last change, newest first.

1.3 WHEN the list is loading, empty or failed, THE SYSTEM SHALL show a loading skeleton, an empty state with a "Create a project" action, or an error message with a retry button, respectively.

1.4 WHEN the user chooses "Try your own video", THE SYSTEM SHALL sign them in anonymously (once the ingestion work exists; until then use the fixture user) and open the upload flow.

## 2. Upload flow

2.1 WHEN the user selects a video file, THE SYSTEM SHALL read its duration in the browser and refuse files longer than 180 seconds with a message that states the limit.

2.2 WHEN the file is accepted, THE SYSTEM SHALL request an upload URL, upload the file, show progress, and then show the processing state.

2.3 IF the upload fails, THEN THE SYSTEM SHALL show what failed and offer retry without losing the script and checklist already entered.

2.4 THE SYSTEM SHALL state the MVP limits (one English video, up to 180 seconds, plain-text script) next to the file picker.

## 3. Script and checklist editor

3.1 WHEN the user edits the script and saves, THE SYSTEM SHALL post a new script version and show which lines changed and which evidence went stale, using the response.

3.2 THE SYSTEM SHALL show script lines as numbered sentences using the segment ids from the server and SHALL keep a line's identity when its text is edited.

3.3 WHEN the user edits only case, spacing or sentence punctuation, THE SYSTEM SHALL say "no evidence affected". (The server decides; the UI shows its answer.)

3.4 WHEN the user edits the checklist, THE SYSTEM SHALL let them add, remove and reorder items and SHALL save the whole list.

3.5 WHEN the project is the demo, THE SYSTEM SHALL show the editor read-only with a note and a "Make an editable copy" button.

## 4. Video player and timeline

4.1 THE SYSTEM SHALL show a video player and a timeline whose width represents the video duration, with markers for evidence candidates at their start and end times.

4.2 WHEN the user clicks a script sentence that has evidence, THE SYSTEM SHALL seek the video to that evidence's `startMs`. WHEN it has none, THE SYSTEM SHALL say so and not seek.

4.3 WHEN the user clicks a timeline marker, THE SYSTEM SHALL scroll to and highlight the matching sentence and open its Evidence Lantern panel.

4.4 WHEN the video plays, THE SYSTEM SHALL highlight the sentence whose interval contains the current time. [PBT: for non-overlapping intervals, `segmentAtMs` returns exactly the interval that contains the time, and nothing outside any interval.]

4.5 THE SYSTEM SHALL map between time and timeline position without drift. [PBT: `percentToMs(msToPercent(t, d), d)` is within 1 ms of `t` for every 0 <= t <= d, and positions stay within 0..100.]

4.6 THE SYSTEM SHALL colour and shape markers by segment state (`covered`, `needs_review`, `stale`, `uncovered`, `outside_proof`) and SHALL NOT rely on colour alone.

4.7 WHEN a candidate is stale, THE SYSTEM SHALL show it as a Poltergeist marker with the label "Evidence out of date".

4.8 IF no video file is available (fixture mode has none), THEN THE SYSTEM SHALL show a clear "no video in fixture mode" panel and keep the timeline and sentence list fully usable with a simulated clock.

## 5. Evidence Lantern panel

5.1 WHEN a sentence or marker is selected, THE SYSTEM SHALL show the evidence for it: the explanation, what was found, what was not found, the limits of the check, the confidence labelled as a ranking, and the time range with a "Play this part" button.

5.2 THE SYSTEM SHALL show every finding label as the spooky name with its plain-English name beside it (use `FINDING_LABELS`).

5.3 THE SYSTEM SHALL describe AI output as a candidate and SHALL show "confirmed" only for evidence a person confirmed.

5.4 WHEN the evidence needs outside proof, THE SYSTEM SHALL say footage cannot prove it and show what kind of proof is needed.

## 6. Exorcism actions

6.1 WHEN the user chooses Confirm, Reject, Needs reshoot or Needs outside proof, THE SYSTEM SHALL call the review endpoint, update the evidence and its findings on success, and announce the result to screen readers.

6.2 IF the server refuses (for example stale evidence cannot be confirmed), THEN THE SYSTEM SHALL show the server's message and leave the screen unchanged.

6.3 WHEN the user chooses Needs reshoot, THE SYSTEM SHALL let them add a note and create a reshoot task.

6.4 THE SYSTEM SHALL disable the actions with a reason when the project is the demo or the evidence is stale (stale evidence offers only Dismiss).

6.5 THE SYSTEM SHALL NOT offer any control that confirms evidence for many items at once.

## 7. States

7.1 THE SYSTEM SHALL show loading, empty, processing, failed and done states for the workspace.

7.2 WHILE a job is `queued` or `running`, THE SYSTEM SHALL poll the job every 2 seconds, show its status and attempt count, and stop polling when it is `succeeded` or `failed`.

7.3 WHEN a job fails, THE SYSTEM SHALL show the short error text and a "Try again" button that starts a new analysis.

7.4 WHEN the job succeeds, THE SYSTEM SHALL load evidence and findings and show the done state with a count of items that still need a person.

## 8. Keyboard, screen reader and motion

8.1 THE SYSTEM SHALL let a keyboard user do everything a mouse user can. On the timeline: Left and Right move between markers, Home and End jump to the first and last, Enter selects, Escape returns focus to the sentence list.

8.2 THE SYSTEM SHALL give every marker, button and panel an accessible name and SHALL announce selection and action results in a polite live region.

8.3 THE SYSTEM SHALL keep a visible focus ring on every interactive element and a logical tab order.

8.4 WHERE the user prefers reduced motion, THE SYSTEM SHALL turn off fog, glow and marker pulsing.

8.5 THE SYSTEM SHALL meet WCAG AA contrast for text and controls on all backgrounds, including over fog. (Automated checks find part of this; a manual pass with a screen reader is still needed.)
