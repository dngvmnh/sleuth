export interface FramePlanOptions {
  intervalMs: number;
  maxFrames: number;
}

/**
 * Timestamps (integer ms) to sample. Starts at 0, steps by `intervalMs`, never exceeds
 * `durationMs`, and widens the step so the count stays within `maxFrames`.
 */
export function planFrames(durationMs: number, options: FramePlanOptions): number[] {
  if (durationMs < 0 || options.maxFrames < 1 || options.intervalMs < 1) return [];
  const step = Math.max(options.intervalMs, Math.ceil(durationMs / options.maxFrames));
  const out: number[] = [];
  for (let t = 0; t <= durationMs && out.length < options.maxFrames; t += step) out.push(t);
  return out;
}
