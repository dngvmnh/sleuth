import type { EvidenceCandidate, EvidenceStatus, ScriptSegment } from "@sleuth/contracts";

/** What the timeline shows for one script line. */
export type SegmentState = "covered" | "needs_review" | "stale" | "uncovered" | "outside_proof";

export const SEGMENT_STATES: readonly SegmentState[] = [
  "covered",
  "needs_review",
  "stale",
  "uncovered",
  "outside_proof",
];

/**
 * One display state per script segment. Rules, first match wins, over the evidence on that segment:
 *
 * 1. a confirmed candidate                       -> covered
 * 2. a needs_outside_proof candidate             -> outside_proof
 * 3. a candidate or needs_reshoot candidate      -> needs_review
 * 4. only stale candidates (nothing fresh)       -> stale
 * 5. nothing, or only rejected candidates        -> uncovered
 *
 * "Fresh" means not stale. Evidence whose `segmentHash` no longer matches the segment counts as
 * stale even if its status was not updated yet, so a caller that forgot to invalidate cannot show
 * out-of-date evidence as valid. Evidence for unknown segments is ignored.
 * The timeline calls this; the UI must not re-implement the rules.
 */
export function deriveSegmentStates(
  segments: readonly Pick<ScriptSegment, "id" | "hash">[],
  evidence: readonly EvidenceCandidate[],
): Record<string, SegmentState> {
  const bySegment = new Map<string, EvidenceStatus[]>();
  const hashes = new Map(segments.map((s) => [s.id, s.hash]));
  for (const e of evidence) {
    const hash = hashes.get(e.scriptSegmentId);
    if (hash === undefined) continue;
    const effective: EvidenceStatus = hash === e.segmentHash ? e.status : "stale";
    const list = bySegment.get(e.scriptSegmentId) ?? [];
    list.push(effective);
    bySegment.set(e.scriptSegmentId, list);
  }

  const out: Record<string, SegmentState> = {};
  for (const s of segments) {
    const statuses = bySegment.get(s.id) ?? [];
    const has = (st: EvidenceStatus) => statuses.includes(st);
    if (has("confirmed")) out[s.id] = "covered";
    else if (has("needs_outside_proof")) out[s.id] = "outside_proof";
    else if (has("candidate") || has("needs_reshoot")) out[s.id] = "needs_review";
    else if (has("stale") && !has("rejected")) out[s.id] = "stale";
    else out[s.id] = "uncovered";
  }
  return out;
}
