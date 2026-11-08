---
inclusion: always
---

# SLEUTH product

SLEUTH is a QA workspace for software demo videos. The user gives it a script (what the presenter means to say), a video (what actually happened), and a checklist (what the demo must show). SLEUTH builds an evidence graph: checklist item -> script segment -> transcript interval -> video interval. It flags problems as haunted-studio findings. Humans resolve findings (Exorcism) and sign off a final report (Final Seal). AI output is always a candidate; only a human confirms.

The Change Impact Engine is the main idea. When one script sentence changes, only the evidence attached to that sentence goes stale. When a new video version is uploaded, all evidence tied to the old video version goes stale.

## Finding types

Every spooky label is always shown with its plain-English label.

| Spooky label | Plain English | Meaning |
|---|---|---|
| Ghost | No visual evidence | A claim or checklist item has no matching footage. |
| Phantom Dialogue | Script line not spoken | A script line was not found in the spoken audio. |
| Cursed Frame | Needs human check | Candidate footage that a person must confirm. |
| Poltergeist | Evidence out of date | Evidence made stale by a script or video change. |
| Needs Outside Proof | Footage cannot prove this | A claim video cannot show, such as "all data is encrypted". |

Actions: Exorcism = a human resolves a finding. Final Seal = a human signs off the report.

## MVP limits

- One English video per project, maximum 180 seconds.
- Plain-text script.
- Manual checklist.
- Timestamps are integers in milliseconds from video start, validated against the asset duration.
