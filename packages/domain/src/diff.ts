import type { ScriptSegment } from "@sleuth/contracts";

export interface ScriptDiff {
  added: string[];
  modified: string[];
  removed: string[];
  unchanged: string[];
}

/** Compare two versions by segment id and hash. Ids are in `next` order, removed ids in `previous` order. */
export function diffScriptVersions(
  previous: readonly Pick<ScriptSegment, "id" | "hash">[],
  next: readonly Pick<ScriptSegment, "id" | "hash">[],
): ScriptDiff {
  const before = new Map(previous.map((s) => [s.id, s.hash]));
  const after = new Set(next.map((s) => s.id));
  const diff: ScriptDiff = { added: [], modified: [], removed: [], unchanged: [] };
  for (const s of next) {
    const old = before.get(s.id);
    if (old === undefined) diff.added.push(s.id);
    else if (old === s.hash) diff.unchanged.push(s.id);
    else diff.modified.push(s.id);
  }
  for (const s of previous) {
    if (!after.has(s.id)) diff.removed.push(s.id);
  }
  return diff;
}
