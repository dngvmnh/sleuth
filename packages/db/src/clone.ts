import type { GoldenFixture } from "@sleuth/contracts";

/** Re-key a fixture under a new project: every known id gets the prefix. Segment ids stay (scoped by version). */
export function cloneWithPrefix(fx: GoldenFixture, projectId: string): GoldenFixture {
  const prefix = `${projectId}:`;
  const ids = new Set<string>([
    fx.project.id,
    fx.assetVersion.id,
    fx.script.id,
    ...fx.checklist.map((c) => c.id),
    ...fx.transcript.map((t) => t.id),
    ...fx.frames.map((f) => f.id),
    ...fx.expectedEvidence.map((e) => e.id),
    ...fx.expectedFindings.map((f) => f.id),
  ]);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string")
      return ids.has(v) ? (v === fx.project.id ? projectId : prefix + v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  const cloned = walk(fx) as GoldenFixture;
  // Evidence ids are `ev-<segment>-<asset>`. Rebuild them from the cloned asset id so a later
  // analysis of the copy produces the same ids and replaces rows instead of adding new ones.
  const renamed = new Map<string, string>();
  const expectedEvidence = cloned.expectedEvidence.map((e) => {
    const id = `ev-${e.scriptSegmentId}-${e.assetVersionId}`;
    renamed.set(e.id, id);
    return { ...e, id };
  });
  const expectedFindings = cloned.expectedFindings.map((f) =>
    f.evidenceId === null ? f : { ...f, evidenceId: renamed.get(f.evidenceId) ?? f.evidenceId },
  );
  return { ...cloned, expectedEvidence, expectedFindings };
}
