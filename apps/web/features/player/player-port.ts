import { clamp } from "../timeline/geometry";

/**
 * The only thing the workspace knows about playback. It never touches a `<video>` directly,
 * so fixture mode (no video file) and tests can drive time with a simulated clock.
 *
 * Time rules match the timeline helpers: integer milliseconds from the start,
 * always within 0..durationMs. A duration of 0 means there is nothing to play.
 */
export type PlayerChangeKind =
  /** The current time moved (a tick, a `timeupdate`, or a duration change). */
  | "time"
  /** Playback started. */
  | "play"
  /** Playback stopped by a pause. */
  | "pause"
  /** The user or code jumped to a new time. */
  | "seek"
  /** Playback reached the end and stopped. */
  | "ended";

export interface PlayerChange {
  kind: PlayerChangeKind;
  currentMs: number;
  playing: boolean;
}

export type PlayerListener = (change: PlayerChange) => void;

export interface PlayerPort {
  /** Current time in whole ms, within 0..durationMs. */
  readonly currentMs: number;
  /** Length in whole ms. 0 when unknown or empty. */
  readonly durationMs: number;
  readonly playing: boolean;
  /** Jump to `ms`. Rounded to whole ms and held inside 0..durationMs. */
  seek(ms: number): void;
  play(): void;
  pause(): void;
  /** Subscribe to changes. Returns an unsubscribe function that is safe to call twice. */
  on(listener: PlayerListener): () => void;
  /** Release timers, DOM listeners and subscribers. The player is unusable afterwards. */
  dispose(): void;
}

/** Whole-ms duration: a finite positive number rounded, otherwise 0. */
export function normaliseDurationMs(durationMs: number): number {
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0;
}

/** Whole-ms time held inside 0..durationMs. A non-finite value becomes 0. */
export function clampTimeMs(ms: number, durationMs: number): number {
  return Math.round(clamp(ms, 0, normaliseDurationMs(durationMs)));
}
