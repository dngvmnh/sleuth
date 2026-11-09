import type { Confidence, EvidenceCandidate, ScriptSegment } from "@sleuth/contracts";
import { deriveSegmentStates } from "@sleuth/domain";
import { STATE_LABELS, type SegmentState } from "./state";

/** One timeline marker: one evidence candidate that has something to show. */
export interface TimelineMarker {
  /** The evidence id. */
  id: string;
  segmentId: string;
  /** 1-based line number in the script. */
  line: number;
  startMs: number;
  endMs: number;
  confidence: Confidence;
  state: Exclude<SegmentState, "uncovered">;
}

/** Whole seconds when possible, otherwise one decimal: 1000 -> "1", 1500 -> "1.5". */
export function formatSeconds(ms: number): string {
  return String(Number((ms / 1000).toFixed(1)));
}

/**
 * Markers for evidence of the current script, ordered by start time.
 * The state of each marker comes from the domain `deriveSegmentStates` applied to that one
 * candidate and its segment (with the segment hash), so a stale candidate, or one whose
 * `segmentHash` no longer matches the line, is a Poltergeist marker even when the line has
 * other evidence.
 * Rejected candidates (state `uncovered`) and evidence for lines that are not in the script
 * get no marker; the sentence list shows the Ghost badge for an empty line instead.
 */
export function buildMarkers(
  segments: readonly ScriptSegment[],
  evidence: readonly EvidenceCandidate[],
): TimelineMarker[] {
  const lineOf = new Map(segments.map((s) => [s.id, s.index + 1]));
  const markers: TimelineMarker[] = [];
  for (const e of evidence) {
    const segment = segments.find((s) => s.id === e.scriptSegmentId);
    const line = lineOf.get(e.scriptSegmentId);
    if (!segment || line === undefined) continue;
    const state = deriveSegmentStates([segment], [e])[segment.id];
    if (state === undefined || state === "uncovered") continue;
    markers.push({
      id: e.id,
      segmentId: e.scriptSegmentId,
      line,
      startMs: e.startMs,
      endMs: e.endMs,
      confidence: e.confidence,
      state,
    });
  }
  return markers.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}

/** The marker a sentence click should use: the earliest one that is not out of date, else the earliest. */
export function primaryMarkerFor(
  markers: readonly TimelineMarker[],
  segmentId: string,
): TimelineMarker | undefined {
  const mine = markers.filter((m) => m.segmentId === segmentId);
  return mine.find((m) => m.state !== "stale") ?? mine[0];
}

const STATE_PHRASE: Record<TimelineMarker["state"], string> = {
  covered: "confirmed by a person",
  needs_review: `${STATE_LABELS.needs_review.name}, ${STATE_LABELS.needs_review.plain.toLowerCase()}`,
  stale: `${STATE_LABELS.stale.name}, ${STATE_LABELS.stale.plain.toLowerCase()}`,
  outside_proof: `${STATE_LABELS.outside_proof.name}, ${STATE_LABELS.outside_proof.plain.toLowerCase()}`,
};

/** Accessible name, e.g. "Evidence for line 3, 11 to 18 seconds, high confidence, Cursed Frame, needs human check". */
export function describeMarker(marker: TimelineMarker): string {
  return `Evidence for line ${marker.line}, ${formatSeconds(marker.startMs)} to ${formatSeconds(
    marker.endMs,
  )} seconds, ${marker.confidence} confidence, ${STATE_PHRASE[marker.state]}`;
}
