/**
 * Which interval is playing at a given time. Pure: no I/O, no clock.
 *
 * Rules:
 * - Intervals are half-open: `startMs <= ms < endMs`. Touching intervals (A ends where B
 *   starts) therefore never both match; the later one owns the shared instant.
 * - An empty interval (`startMs === endMs`) contains no time and is never returned.
 * - The very end of the last interval is outside it, so there is no match at `ms === endMs`.
 * - Gaps, times before the first interval and times after the last one return `undefined`.
 * - A non-finite `ms` returns `undefined`.
 * - Overlap is not expected. If it happens anyway, the first match in input order wins.
 */
export interface TimedInterval {
  startMs: number;
  endMs: number;
}

export function segmentAtMs<T extends TimedInterval>(
  intervals: readonly T[],
  ms: number,
): T | undefined {
  if (!Number.isFinite(ms)) return undefined;
  return intervals.find((interval) => interval.startMs <= ms && ms < interval.endMs);
}
