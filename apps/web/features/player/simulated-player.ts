import {
  clampTimeMs,
  normaliseDurationMs,
  type PlayerChangeKind,
  type PlayerListener,
  type PlayerPort,
} from "./player-port";

/**
 * A player with a manual clock, for fixture mode (no video file) and tests.
 * It never plays footage. Time only moves when `tick(deltaMs)` is called, so the caller
 * owns the clock: a test calls it directly, the UI calls it from a timer.
 *
 * Rules:
 * - `tick` moves time only while playing. A tick while paused changes nothing.
 * - Reaching the end stops playback at exactly `durationMs` and emits `ended`.
 * - `play` at the end restarts from 0, like a real video. With a duration of 0 it does nothing.
 * - `seek` rounds to whole ms and holds the time inside 0..durationMs. It does not change
 *   whether the player is playing, except that seeking to the end of a playing video ends it.
 */
export class SimulatedPlayer implements PlayerPort {
  private time = 0;
  private isPlaying = false;
  private disposed = false;
  private readonly length: number;
  private listeners = new Set<PlayerListener>();

  constructor(durationMs: number) {
    this.length = normaliseDurationMs(durationMs);
  }

  get currentMs(): number {
    return this.time;
  }

  get durationMs(): number {
    return this.length;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  seek(ms: number): void {
    if (this.disposed) return;
    this.time = clampTimeMs(ms, this.length);
    if (this.isPlaying && this.time >= this.length) {
      this.isPlaying = false;
      this.emit("seek");
      this.emit("ended");
      return;
    }
    this.emit("seek");
  }

  play(): void {
    if (this.disposed || this.isPlaying || this.length === 0) return;
    if (this.time >= this.length) this.time = 0;
    this.isPlaying = true;
    this.emit("play");
  }

  pause(): void {
    if (this.disposed || !this.isPlaying) return;
    this.isPlaying = false;
    this.emit("pause");
  }

  /** Advance the clock by `deltaMs`. Ignored while paused or for a non-positive or non-finite delta. */
  tick(deltaMs: number): void {
    if (this.disposed || !this.isPlaying) return;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.time = clampTimeMs(this.time + deltaMs, this.length);
    if (this.time >= this.length) {
      this.isPlaying = false;
      this.emit("time");
      this.emit("ended");
      return;
    }
    this.emit("time");
  }

  on(listener: PlayerListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.isPlaying = false;
    this.listeners.clear();
  }

  private emit(kind: PlayerChangeKind): void {
    // Copy first: a listener may unsubscribe while we are notifying.
    for (const listener of [...this.listeners]) {
      listener({ kind, currentMs: this.time, playing: this.isPlaying });
    }
  }
}
