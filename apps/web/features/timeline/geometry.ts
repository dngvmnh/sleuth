/**
 * Pure maths between video time and timeline position. No I/O, no clock.
 * Time is integer milliseconds from video start. Position is a percentage, 0 to 100.
 *
 * Rules:
 * - A duration of 0 (or less, or not finite) has no usable width: every time maps to 0%,
 *   and every position maps back to 0 ms.
 * - Inputs outside the range are clamped, never extrapolated: ms below 0 is the start,
 *   ms above the duration is the end, percent is held inside 0..100.
 * - A non-finite input counts as the start.
 */

/** Hold `value` inside `[min, max]`. A non-finite value becomes `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function usableDuration(durationMs: number): boolean {
  return Number.isFinite(durationMs) && durationMs > 0;
}

/** Position of `ms` on a timeline of `durationMs`, as a percentage in 0..100. Not rounded. */
export function msToPercent(ms: number, durationMs: number): number {
  if (!usableDuration(durationMs)) return 0;
  return clamp((clamp(ms, 0, durationMs) / durationMs) * 100, 0, 100);
}

/** Time at `percent` of a timeline of `durationMs`, rounded to whole ms within 0..durationMs. */
export function percentToMs(percent: number, durationMs: number): number {
  if (!usableDuration(durationMs)) return 0;
  const ms = Math.round((clamp(percent, 0, 100) / 100) * durationMs);
  return clamp(ms, 0, Math.round(durationMs));
}
