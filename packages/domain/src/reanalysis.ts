import type { EvidenceCandidate } from "@sleuth/contracts";
import type { ScriptDiff } from "./diff";

export interface ReanalysisOptions {
  /** A new video version was uploaded: every surviving segment needs a fresh analysis. */
  assetChanged?: boolean;
}

/**
 * Segment ids that need new analysis after a change.
 *
 * - modified and added segments, always
 * - unchanged segments whose evidence is all stale (for example after a new video)
 * - with `assetChanged`, every segment that still exists
 *
 * Never includes removed segments, and never an unchanged segment that still has non-stale
 * evidence. Pass the evidence as it is AFTER invalidation. Order: modified, added, then the rest;
 * no duplicates.
 */
export function planReanalysis(
  diff: ScriptDiff,
  evidence: readonly EvidenceCandidate[],
  options: ReanalysisOptions = {},
): string[] {
  const plan = new Set<string>([...diff.modified, ...diff.added]);

  if (options.assetChanged) {
    for (const id of diff.unchanged) plan.add(id);
    return [...plan];
  }

  const hasFresh = new Set<string>();
  const hasStale = new Set<string>();
  for (const e of evidence) {
    (e.status === "stale" ? hasStale : hasFresh).add(e.scriptSegmentId);
  }
  for (const id of diff.unchanged) {
    if (hasStale.has(id) && !hasFresh.has(id)) plan.add(id);
  }
  return [...plan];
}
