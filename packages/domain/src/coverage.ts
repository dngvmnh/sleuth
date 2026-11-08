import type {
  ChecklistItem,
  CoverageItem,
  CoverageState,
  CoverageSummary,
  EvidenceCandidate,
  EvidenceStatus,
  ReshootTask,
  ReviewDecision,
  ScriptVersion,
} from "@sleuth/contracts";

export const OUTSIDE_PROOF_HINT =
  "Needs proof from outside the video, such as a security report, a compliance certificate or a benchmark.";

type DecisionLike = Pick<ReviewDecision, "evidenceId" | "decision"> & { createdAt?: string };

/** The most recent decision per evidence id. Later entries win; `createdAt` breaks ties when present. */
function latestDecisions(
  decisions: readonly DecisionLike[],
): Map<string, DecisionLike["decision"]> {
  const latest = new Map<string, { decision: DecisionLike["decision"]; at: string }>();
  for (const d of decisions) {
    const at = d.createdAt ?? "";
    const old = latest.get(d.evidenceId);
    if (!old || at >= old.at) latest.set(d.evidenceId, { decision: d.decision, at });
  }
  return new Map([...latest].map(([k, v]) => [k, v.decision]));
}

/**
 * Coverage of the checklist. For each item, first match wins:
 *
 * 1. proven         a non-stale candidate is `confirmed` AND a person's latest decision on it is confirm
 * 2. outside_proof  a candidate is `needs_outside_proof` AND a person decided needs_outside_proof
 * 3. reshoot        a person decided needs_reshoot on a candidate, or an open reshoot task names the item
 * 4. needs_review   any other live candidate: undecided, or proposed by the engine as outside proof
 * 5. uncovered      nothing usable (no evidence, only stale, or only rejected)
 *
 * Status alone never proves anything: a `confirmed` status without a person's confirm decision is
 * not counted, so AI output cannot count as proven. Evidence whose segment is gone or whose
 * `segmentHash` no longer matches the script is treated as stale. A reshoot marked done does not
 * make an item proven; only new confirmed evidence does.
 */
export function computeCoverage(
  checklist: readonly ChecklistItem[],
  script: Pick<ScriptVersion, "segments"> | null,
  evidence: readonly EvidenceCandidate[],
  decisions: readonly DecisionLike[],
  reshoots: readonly Pick<ReshootTask, "id" | "checklistItemId" | "status">[] = [],
): CoverageSummary {
  const hashes = new Map((script?.segments ?? []).map((s) => [s.id, s.hash]));
  const effective = (e: EvidenceCandidate): EvidenceStatus =>
    script !== null && hashes.get(e.scriptSegmentId) !== e.segmentHash ? "stale" : e.status;
  const decided = latestDecisions(decisions);

  const items: CoverageItem[] = checklist.map((item) => {
    const mine = evidence.filter((e) => e.checklistItemId === item.id);
    const live = mine.filter((e) => {
      const s = effective(e);
      return s !== "stale" && s !== "rejected";
    });
    const has = (status: EvidenceStatus, decision: DecisionLike["decision"]) =>
      live.some((e) => effective(e) === status && decided.get(e.id) === decision);

    let state: CoverageState;
    if (has("confirmed", "confirm")) state = "proven";
    else if (has("needs_outside_proof", "needs_outside_proof")) state = "outside_proof";
    else if (
      has("needs_reshoot", "needs_reshoot") ||
      reshoots.some((r) => r.status === "open" && r.checklistItemId === item.id)
    ) {
      state = "reshoot";
    } else if (live.length > 0) state = "needs_review";
    else state = "uncovered";

    return { checklistItemId: item.id, state, evidenceIds: live.map((e) => e.id) };
  });

  const totals = { proven: 0, needs_review: 0, outside_proof: 0, reshoot: 0, uncovered: 0 };
  for (const i of items) totals[i.state] += 1;

  const outsideProof = evidence
    .filter((e) => effective(e) === "needs_outside_proof")
    .map((e) => ({
      scriptSegmentId: e.scriptSegmentId,
      hint: OUTSIDE_PROOF_HINT,
      acknowledged: decided.get(e.id) === "needs_outside_proof",
    }));

  return {
    items,
    totals,
    provenPercent: items.length === 0 ? 0 : Math.floor((100 * totals.proven) / items.length),
    outsideProof,
    openReshootIds: reshoots.filter((r) => r.status === "open").map((r) => r.id),
  };
}
