export interface LimitConfig {
  /** Longest video allowed, in ms (180000 for the MVP). */
  maxVideoMs: number;
  /** Analysis requests one user may make per UTC day. */
  dailyAnalysisLimit: number;
}

export type LimitFailure = "invalid_duration" | "video_too_long" | "limit_exceeded";

export type LimitCheck = { ok: true } | { ok: false; code: LimitFailure };

export interface LimitInput {
  /** Set when checking an upload. Must be an integer from 0 to `maxVideoMs`. */
  durationMs?: number;
  /** Set when checking an analysis request: accepted requests so far today. */
  analysesToday?: number;
  config: LimitConfig;
}

/**
 * Pure limit rules. The caller supplies the counts, so there is no clock in here.
 * Duration is checked first, then the daily count. A field left out is not checked.
 */
export function checkLimits({ durationMs, analysesToday, config }: LimitInput): LimitCheck {
  if (durationMs !== undefined) {
    if (!Number.isInteger(durationMs) || durationMs < 0)
      return { ok: false, code: "invalid_duration" };
    if (durationMs > config.maxVideoMs) return { ok: false, code: "video_too_long" };
  }
  if (analysesToday !== undefined && analysesToday >= config.dailyAnalysisLimit) {
    return { ok: false, code: "limit_exceeded" };
  }
  return { ok: true };
}

/** Start of the UTC day (ms since epoch) that contains `nowMs`. */
export function startOfUtcDayMs(nowMs: number): number {
  const day = 86_400_000;
  return nowMs - (((nowMs % day) + day) % day);
}

/** When the daily count resets: the start of the next UTC day. */
export function nextUtcDayMs(nowMs: number): number {
  return startOfUtcDayMs(nowMs) + 86_400_000;
}
