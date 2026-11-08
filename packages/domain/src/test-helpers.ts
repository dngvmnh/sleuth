import type { EvidenceCandidate, EvidenceStatus } from "@sleuth/contracts";

/** Build a valid evidence candidate for tests. Not exported from the package index. */
export function makeEvidence(
  overrides: Partial<EvidenceCandidate> & { scriptSegmentId: string },
): EvidenceCandidate {
  return {
    id: `ev-${overrides.scriptSegmentId}`,
    projectId: "p1",
    checklistItemId: null,
    scriptVersionId: "sv1",
    segmentHash: "a".repeat(64),
    assetVersionId: "av1",
    startMs: 1000,
    endMs: 2000,
    transcriptSegmentIds: [],
    frameObservationIds: [],
    explanation: "test evidence",
    confidence: "medium",
    status: "candidate" as EvidenceStatus,
    source: "ai",
    analysisRunId: "run1",
    ...overrides,
  };
}
