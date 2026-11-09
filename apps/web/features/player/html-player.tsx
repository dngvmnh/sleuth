import {
  clampTimeMs,
  normaliseDurationMs,
  type PlayerChangeKind,
  type PlayerListener,
  type PlayerPort,
} from "./player-port";

/** The slice of `HTMLVideoElement` the adapter uses. A real `<video>` satisfies it; tests pass a stub. */
export interface VideoElementLike {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

const EVENT_TO_KIND: Readonly<Record<string, PlayerChangeKind>> = {
  timeupdate: "time",
  durationchange: "time",
  loadedmetadata: "time",
  seeked: "seek",
  play: "play",
  pause: "pause",
  ended: "ended",
};

/**
 * Wraps a real video element as a `PlayerPort`. Seconds in the element become
 * whole ms here, held inside 0..durationMs. Call `dispose()` to remove the DOM listeners.
 */
export class HtmlVideoPlayer implements PlayerPort {
  private listeners = new Set<PlayerListener>();
  private disposed = false;
  private readonly handlers = new Map<string, () => void>();

  constructor(private readonly video: VideoElementLike) {
    for (const [type, kind] of Object.entries(EVENT_TO_KIND)) {
      const handler = () => this.emit(kind);
      this.handlers.set(type, handler);
      video.addEventListener(type, handler);
    }
  }

  get durationMs(): number {
    return normaliseDurationMs(this.video.duration * 1000);
  }

  get currentMs(): number {
    return clampTimeMs(this.video.currentTime * 1000, this.durationMs);
  }

  get playing(): boolean {
    return !this.video.paused && !this.video.ended;
  }

  seek(ms: number): void {
    if (this.disposed) return;
    this.video.currentTime = clampTimeMs(ms, this.durationMs) / 1000;
  }

  play(): void {
    if (this.disposed || this.durationMs === 0) return;
    // Browsers may refuse to play (autoplay rules). That is not an error for the workspace:
    // no `play` event fires, so the state stays paused.
    Promise.resolve(this.video.play()).catch(() => undefined);
  }

  pause(): void {
    if (this.disposed) return;
    this.video.pause();
  }

  on(listener: PlayerListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [type, handler] of this.handlers) this.video.removeEventListener(type, handler);
    this.handlers.clear();
    this.listeners.clear();
  }

  private emit(kind: PlayerChangeKind): void {
    for (const listener of [...this.listeners]) {
      listener({ kind, currentMs: this.currentMs, playing: this.playing });
    }
  }
}
