# Final seal: requirements

Owner: Đạt (@phatdat220707) for the report and sign-off UI. Backend endpoints, rules and report content are Đăng's (@dngvmnh) tasks inside this spec. Covers the report page, CSV and printable HTML export, coverage summary, open reshoots, the outside-proof list, and sign-off (the Final Seal).

Today (Phase 2) `GET /projects/:id/report.csv` and `report.html` exist and list findings and evidence (`apps/web/app/api/_lib/report.ts`). There is no coverage, no reshoot list endpoint, no sign-off. The report says "This report has not been signed off."

New endpoints need a contract change (PR label `contract-change`): `GET /projects/{id}/coverage`, `GET /projects/{id}/reshoots`, `PATCH /reshoots/{id}`, `POST /projects/{id}/seal`.

`[PBT]` marks a criterion that a fast-check property test must cover.

## 1. Coverage summary

1.1 THE SYSTEM SHALL compute, for each checklist item, one coverage state: `proven` (at least one confirmed, non-stale candidate), `needs_review` (only undecided candidates), `outside_proof` (a person marked it needs outside proof), `reshoot` (a person marked it needs reshoot, or an open reshoot task exists), `uncovered` (nothing usable).

1.2 THE SYSTEM SHALL use review decisions, not candidate status alone, to tell a person's outside-proof decision from the engine's proposal. An engine-proposed `needs_outside_proof` candidate with no human decision counts as `needs_review`.

1.3 THE SYSTEM SHALL return totals per state and the percentage of checklist items that are `proven`. [PBT: totals sum to the number of checklist items; each item has exactly one state; the percentage is between 0 and 100.]

1.4 THE SYSTEM SHALL count a stale candidate as nothing. [PBT: marking any candidate stale never increases `proven`.]

1.5 THE SYSTEM SHALL never count an unconfirmed candidate as proven. [PBT: with no confirm decisions, `proven` is 0.]

## 2. Reshoots and outside proof

2.1 WHEN a person lists reshoot tasks for a project they can read, THE SYSTEM SHALL return them with the checklist item or script line they refer to.

2.2 WHEN the owner marks a reshoot task done, THE SYSTEM SHALL record it. A reshoot marked done SHALL NOT make the checklist item `proven`; only new confirmed evidence does.

2.3 THE SYSTEM SHALL list every script line that needs outside proof, each with the kind of proof that could back it, and whether a person has acknowledged it.

## 3. Sign-off (Final Seal)

3.1 WHEN the owner asks to seal a project, THE SYSTEM SHALL check the sealing rules and, if they pass, record a seal with the person's id, time, the script version, the asset version, the coverage snapshot and an optional note.

3.2 THE SYSTEM SHALL refuse to seal while any of these is true: a candidate on the current versions is undecided (`candidate`); stale evidence has not been dismissed; a checklist item is `uncovered`; a job is queued or running; the project has no analysis. The response SHALL list each blocker. [PBT: if any undecided candidate exists, sealing is refused; if sealing is allowed, every checklist item has a state other than `uncovered` and `needs_review`.]

3.3 THE SYSTEM SHALL allow sealing with open reshoots and outside-proof items, and SHALL show them on the seal and in every export.

3.4 THE SYSTEM SHALL require a signed-in person. A seal SHALL NOT be created by the worker, a script or any request without a user id. [PBT: sealing with an empty or blank user id never succeeds.]

3.5 THE SYSTEM SHALL refuse a seal on the demo project.

3.6 WHEN a script revision or video upload makes evidence stale after a seal, THE SYSTEM SHALL mark the seal `broken`, keep its record, and show "Seal broken: evidence changed after sign-off" everywhere the seal appears.

3.7 THE SYSTEM SHALL keep only one active seal per project and keep the history of earlier and broken seals.

## 4. Report page

4.1 THE SYSTEM SHALL show at `/projects/[id]/report`: project name, seal status, coverage summary with per-item states, findings with spooky and plain labels, open reshoots, the outside-proof list, and the limits of the checks.

4.2 WHEN the project is not sealed, THE SYSTEM SHALL show "Draft: not signed off" at the top and in exports.

4.3 THE SYSTEM SHALL show the Final Seal action only to the project owner, disabled with the list of blockers when sealing is refused.

4.4 WHEN the seal is created, THE SYSTEM SHALL show a wax-seal confirmation and announce it to screen readers; the animation SHALL respect reduced motion.

## 5. Exports

5.1 THE SYSTEM SHALL provide the report as CSV (`report.csv`) and printable HTML (`report.html`).

5.2 THE EXPORTS SHALL include seal status, coverage totals, per-item states, findings, open reshoots and outside-proof items. A broken or missing seal SHALL be stated at the top.

5.3 THE SYSTEM SHALL escape all text in HTML and neutralise spreadsheet formulas in CSV cells. [PBT: for any text, escaped HTML contains no raw `<` or `&` from the input; CSV cells starting with `=`, `+`, `-` or `@` are prefixed.]

5.4 THE PRINTABLE HTML SHALL print cleanly on A4/Letter without dark backgrounds or animation.

5.5 THE EXPORTS SHALL NOT contain transcripts, frames, signed URLs or keys. Script lines the user wrote are allowed.

## 6. Honesty of the report

6.1 THE REPORT SHALL state that matches are candidates found by software, that confidence is a ranking not proof, and who confirmed each item (user id, time).

6.2 THE REPORT SHALL NOT show any number the system did not compute (no invented accuracy or time saved).
