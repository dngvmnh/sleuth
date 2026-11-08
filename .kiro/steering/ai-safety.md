---
inclusion: always
---

# AI safety rules

- AI output is a candidate. It is never auto-confirmed. Only a human review decision moves evidence to `confirmed`.
- Confidence (`low | medium | high`) is a ranking signal, not proof and not accuracy. Never present it as a probability of being correct.
- Every warning states three things: what was found, what was not found, and the limits of the check.
- Claims that footage cannot prove (security, encryption, performance guarantees, legal claims) are marked `needs_outside_proof`.
- Never log media content, transcripts, frames, signed URLs or secrets. Log IDs and counts only.
- Never report invented metrics. Precision and recall come from the evaluation harness in `tests/evaluation/`.
- Code paths that set `status: confirmed` must require a human `ReviewDecision`. Add a test for any new path.
