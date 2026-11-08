import type { EvidenceCandidate, Finding } from "@sleuth/contracts";

/**
 * Idempotent merge. Candidates are keyed by id (segment + video version), so running the same
 * analysis twice adds nothing. A human-reviewed candidate with an unchanged hash is kept as is.
 * Lives in domain (pure) so every store can use it; evidence-engine re-exports it.
 */
export function mergeEvidence(
  existing: readonly EvidenceCandidate[],
  produced: readonly EvidenceCandidate[],
): EvidenceCandidate[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const p of produced) {
    const old = byId.get(p.id);
    const humanDecided =
      old !== undefined &&
      old.segmentHash === p.segmentHash &&
      old.status !== "candidate" &&
      old.status !== "stale";
    if (!humanDecided) byId.set(p.id, p);
  }
  return [...byId.values()];
}

/** Same idea for findings: resolved findings stay resolved. */
export function mergeFindings(
  existing: readonly Finding[],
  produced: readonly Finding[],
): Finding[] {
  const byId = new Map(existing.map((f) => [f.id, f]));
  for (const p of produced) {
    const old = byId.get(p.id);
    if (old?.status !== "resolved") byId.set(p.id, p);
  }
  return [...byId.values()];
}
