import type { ScriptSegment } from "@sleuth/contracts";
import { normaliseAndHash, normaliseText } from "./normalise";

/** Split after . ! ? (plus an optional closing quote) when a capital letter or digit follows. */
const SENTENCE_BREAK = /(?<=[.!?]["')\]]?)\s+(?=["'([]?[\p{Lu}\p{N}])/u;

export interface SegmentScriptOptions {
  scriptVersionId: string;
  /**
   * Segments of the previous version. New segments reuse an old id when the hash matches
   * (reorder-safe), or when they sit at the same position as an unmatched old segment
   * (treated as an edit). Everything else gets a fresh id.
   */
  previous?: readonly ScriptSegment[];
  /** Every segment id the project has ever used. These are never handed out again. */
  retiredIds?: readonly string[];
}

/** Split plain text into sentences. One line break always ends a sentence. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.trim().split(SENTENCE_BREAK))
    .map((s) => s.trim())
    .filter((s) => normaliseText(s) !== "");
}

function nextIdNumber(ids: readonly string[]): number {
  let max = 0;
  for (const id of ids) {
    const m = /^seg-(\d+)$/.exec(id);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export function segmentScript(text: string, options: SegmentScriptOptions): ScriptSegment[] {
  const previous = options.previous ?? [];
  const parts = splitSentences(text).map((t) => ({ text: t, hash: normaliseAndHash(t) }));
  const usedPrevious = new Set<string>();
  const assigned: (string | undefined)[] = parts.map(() => undefined);

  // Pass 1: same normalised text keeps its id, wherever it moved.
  parts.forEach((part, i) => {
    const match = previous.find((s) => !usedPrevious.has(s.id) && s.hash === part.hash);
    if (match) {
      usedPrevious.add(match.id);
      assigned[i] = match.id;
    }
  });
  // Pass 2: same position as an unmatched old segment means "edited".
  parts.forEach((_, i) => {
    if (assigned[i] !== undefined) return;
    const match = previous.find((s) => s.index === i && !usedPrevious.has(s.id));
    if (match) {
      usedPrevious.add(match.id);
      assigned[i] = match.id;
    }
  });
  // Pass 3: new segments get fresh ids.
  let counter = nextIdNumber([...previous.map((s) => s.id), ...(options.retiredIds ?? [])]);
  return parts.map((part, i) => ({
    id: assigned[i] ?? `seg-${counter++}`,
    scriptVersionId: options.scriptVersionId,
    index: i,
    text: part.text,
    hash: part.hash,
  }));
}
