import type { EvidenceCandidate, ScriptSegment } from "@sleuth/contracts";

/**
 * Everything a person could still rely on goes stale. Two statuses stay as they are:
 * `stale` (already done) and `rejected` (a person already said no, or dismissed stale evidence;
 * flipping it back to stale on the next edit would reopen a finding nobody asked to see again).
 * Rejected evidence can never be confirmed later: see `applyReviewDecision`.
 */
function markStale(evidence: EvidenceCandidate): EvidenceCandidate {
  return evidence.status === "stale" || evidence.status === "rejected"
    ? evidence
    : { ...evidence, status: "stale" };
}

/**
 * Evidence goes stale when its script segment is gone or its hash no longer matches the
 * hash the evidence was built against. Evidence on other segments is returned untouched.
 */
export function invalidateForScriptChange(
  evidence: readonly EvidenceCandidate[],
  nextSegments: readonly Pick<ScriptSegment, "id" | "hash">[],
): EvidenceCandidate[] {
  const current = new Map(nextSegments.map((s) => [s.id, s.hash]));
  return evidence.map((e) => {
    const hash = current.get(e.scriptSegmentId);
    return hash === undefined || hash !== e.segmentHash ? markStale(e) : e;
  });
}

/** Every candidate built on any other video version goes stale. */
export function invalidateForNewAssetVersion(
  evidence: readonly EvidenceCandidate[],
  newAssetVersionId: string,
): EvidenceCandidate[] {
  return evidence.map((e) => (e.assetVersionId === newAssetVersionId ? e : markStale(e)));
}
