import type { ScriptSegment, TranscriptSegment } from "@sleuth/contracts";
import { SPOKEN_MIN_COVERAGE, SPOKEN_STRONG_COVERAGE } from "./thresholds";
import { contentTokens, coverage } from "./text";

/**
 * How one script line relates to the spoken audio.
 * - `exact`: spoken, at least `SPOKEN_STRONG_COVERAGE` of its key words.
 * - `changed`: spoken, but only `SPOKEN_MIN_COVERAGE` up to `SPOKEN_STRONG_COVERAGE` of its key words.
 * - `missing`: no transcript segment reaches `SPOKEN_MIN_COVERAGE`.
 * - `reordered`: spoken, but at a different place in the order than the script puts it.
 */
export type AlignmentLabel = "exact" | "changed" | "missing" | "reordered";

export interface AlignedSegment {
  segmentId: string;
  label: AlignmentLabel;
  /** The transcript segment that covers the line; null only when the label is `missing`. */
  transcriptId: string | null;
  /** Share of the line's key words found in that transcript segment, 0 to 1. */
  coverage: number;
}

export interface AlignmentResult {
  /** One entry per script segment, in script order. */
  aligned: AlignedSegment[];
  /** Transcript segments that no script line uses, in time order. */
  unscripted: string[];
}

interface Pair {
  s: number;
  t: number;
  score: number;
}

const byTime = (a: TranscriptSegment, b: TranscriptSegment): number =>
  a.startMs - b.startMs || a.endMs - b.endMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Indices (into `values`) of one longest strictly increasing subsequence. Deterministic: ties
 * keep the earliest candidate.
 */
function longestIncreasing(values: readonly number[]): Set<number> {
  const tails: number[] = []; // index into values of the smallest tail for each length
  const previous: number[] = new Array<number>(values.length).fill(-1);
  for (const [i, value] of values.entries()) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((values[tails[mid] ?? 0] ?? 0) < value) lo = mid + 1;
      else hi = mid;
    }
    previous[i] = lo > 0 ? (tails[lo - 1] ?? -1) : -1;
    tails[lo] = i;
  }
  const keep = new Set<number>();
  let cursor = tails.length > 0 ? (tails[tails.length - 1] ?? -1) : -1;
  while (cursor !== -1) {
    keep.add(cursor);
    cursor = previous[cursor] ?? -1;
  }
  return keep;
}

/**
 * Matches each script line to at most one spoken segment and labels how well it matches.
 *
 * Every (line, spoken segment) pair is scored by key-word coverage. Pairs are taken best first, so
 * one spoken segment serves one line. Equal scores prefer the pair closest in position, which keeps
 * two identical lines paired in order. A matched line is `reordered` when it falls outside the
 * longest run of lines whose spoken segments come in script order.
 */
export function align(
  segments: readonly ScriptSegment[],
  transcript: readonly TranscriptSegment[],
): AlignmentResult {
  const spoken = [...transcript].sort(byTime);
  const lineTokens = segments.map((segment) => contentTokens(segment.text));
  const spokenTokens = spoken.map((t) => contentTokens(t.text));

  const pairs: Pair[] = [];
  for (const [s, tokens] of lineTokens.entries()) {
    for (const [t, haystack] of spokenTokens.entries()) {
      const score = coverage(tokens, haystack);
      if (score >= SPOKEN_MIN_COVERAGE) pairs.push({ s, t, score });
    }
  }
  pairs.sort(
    (a, b) =>
      b.score - a.score || Math.abs(a.s - a.t) - Math.abs(b.s - b.t) || a.s - b.s || a.t - b.t,
  );

  const lineToSpoken = new Map<number, Pair>();
  const usedSpoken = new Set<number>();
  for (const pair of pairs) {
    if (lineToSpoken.has(pair.s) || usedSpoken.has(pair.t)) continue;
    lineToSpoken.set(pair.s, pair);
    usedSpoken.add(pair.t);
  }

  // Lines that matched, in script order, with the time rank of their spoken segment.
  const matchedLines = segments.flatMap((_, s) => (lineToSpoken.has(s) ? [s] : []));
  const inOrder = longestIncreasing(matchedLines.map((s) => lineToSpoken.get(s)?.t ?? 0));
  const outOfOrder = new Set<number>();
  for (const [position, s] of matchedLines.entries()) if (!inOrder.has(position)) outOfOrder.add(s);

  const aligned: AlignedSegment[] = segments.map((segment, s) => {
    const pair = lineToSpoken.get(s);
    if (!pair) return { segmentId: segment.id, label: "missing", transcriptId: null, coverage: 0 };
    const label: AlignmentLabel = outOfOrder.has(s)
      ? "reordered"
      : pair.score >= SPOKEN_STRONG_COVERAGE
        ? "exact"
        : "changed";
    return {
      segmentId: segment.id,
      label,
      transcriptId: spoken[pair.t]?.id ?? null,
      coverage: pair.score,
    };
  });

  const unscripted = spoken.filter((_, t) => !usedSpoken.has(t)).map((t) => t.id);
  return { aligned, unscripted };
}
