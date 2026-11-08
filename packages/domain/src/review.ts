import type {
  EvidenceCandidate,
  EvidenceStatus,
  ReviewDecision,
  ReviewDecisionKind,
} from "@sleuth/contracts";

export type ReviewFailure = "wrong_evidence" | "missing_human_reviewer" | "stale_needs_reanalysis";

export type ReviewResult =
  { ok: true; evidence: EvidenceCandidate } | { ok: false; reason: ReviewFailure };

const TARGET_STATUS: Record<ReviewDecisionKind, EvidenceStatus> = {
  confirm: "confirmed",
  reject: "rejected",
  needs_reshoot: "needs_reshoot",
  needs_outside_proof: "needs_outside_proof",
};

/**
 * The only way evidence becomes `confirmed`: a ReviewDecision from a named person.
 * Stale evidence cannot be confirmed or re-labelled; it can only be dismissed (rejected).
 * AI output never reaches `confirmed` through any other path.
 */
export function applyReviewDecision(
  evidence: EvidenceCandidate,
  decision: Pick<ReviewDecision, "evidenceId" | "decision" | "reviewerId">,
): ReviewResult {
  if (decision.evidenceId !== evidence.id) return { ok: false, reason: "wrong_evidence" };
  if (decision.reviewerId.trim() === "") return { ok: false, reason: "missing_human_reviewer" };
  if (evidence.status === "stale" && decision.decision !== "reject") {
    return { ok: false, reason: "stale_needs_reanalysis" };
  }
  return { ok: true, evidence: { ...evidence, status: TARGET_STATUS[decision.decision] } };
}
