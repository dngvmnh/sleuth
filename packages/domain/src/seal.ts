import type {
  CoverageSummary,
  EvidenceCandidate,
  ProcessingJob,
  SealBlocker,
} from "@sleuth/contracts";

export interface SealInput {
  coverage: CoverageSummary;
  /** All evidence stored for the project. Stale evidence is expected to be marked `stale`. */
  evidence: readonly Pick<EvidenceCandidate, "status">[];
  jobs: readonly Pick<ProcessingJob, "status">[];
  /** The project has been analysed at least once (a succeeded job, or stored evidence). */
  hasAnalysis: boolean;
}

/**
 * Everything that stops a project from being sealed right now, in a fixed order.
 *
 * - undecided_candidates: a candidate nobody decided on, or a checklist item still `needs_review`
 *   (this includes an outside-proof claim the engine proposed and no person acknowledged)
 * - stale_evidence: stale evidence nobody dismissed (a person dismisses it by rejecting it)
 * - uncovered_items: a checklist item with nothing usable, or no checklist at all (nothing to certify)
 * - job_running: analysis is queued or running
 * - no_analysis: the project was never analysed
 *
 * Open reshoots and acknowledged outside-proof items do NOT block; they are shown on the seal.
 */
export function sealBlockers(input: SealInput): SealBlocker[] {
  const blockers: SealBlocker[] = [];
  if (
    input.evidence.some((e) => e.status === "candidate") ||
    input.coverage.items.some((i) => i.state === "needs_review")
  ) {
    blockers.push("undecided_candidates");
  }
  if (input.evidence.some((e) => e.status === "stale")) blockers.push("stale_evidence");
  if (
    input.coverage.items.length === 0 ||
    input.coverage.items.some((i) => i.state === "uncovered")
  ) {
    blockers.push("uncovered_items");
  }
  if (input.jobs.some((j) => j.status === "queued" || j.status === "running"))
    blockers.push("job_running");
  if (!input.hasAnalysis) blockers.push("no_analysis");
  return blockers;
}

export type SealDecision = { ok: true } | { ok: false; blockers: SealBlocker[] };

/** Pure sealing rule. Who may seal (a signed-in owner, not the demo) is checked by the store first. */
export function canSeal(input: SealInput): SealDecision {
  const blockers = sealBlockers(input);
  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}
