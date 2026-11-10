import { describe, expect, it, vi } from "vitest";
import { checkDurationMs, readVideoDurationMs, type DurationDeps, type MetadataVideo } from "./duration";

/** A stand-in <video>: fires the event it is told to as soon as `src` is set. */
function fakeDeps(outcome: { duration?: number; fail?: boolean }) {
  const listeners = new Map<string, () => void>();
  const video: MetadataVideo = {
    preload: "",
    duration: outcome.duration ?? Number.NaN,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    get src() {
      return "";
    },
    set src(_url: string) {
      queueMicrotask(() => listeners.get(outcome.fail ? "error" : "loadedmetadata")?.());
    },
  };
  const deps: DurationDeps = {
    createVideo: () => video,
    createUrl: vi.fn(() => "blob:test"),
    revokeUrl: vi.fn(),
  };
  return { deps, video, listeners };
}

describe("readVideoDurationMs", () => {
  it("reads the length from the video metadata as whole ms", async () => {
    const { deps, video } = fakeDeps({ duration: 52.3456 });
    await expect(readVideoDurationMs(new Blob(), deps)).resolves.toBe(52_346);
    expect(video.preload).toBe("metadata");
  });

  it("releases the object URL and the listeners when done", async () => {
    const { deps, listeners } = fakeDeps({ duration: 10 });
    await readVideoDurationMs(new Blob(), deps);
    expect(deps.revokeUrl).toHaveBeenCalledWith("blob:test");
    expect(listeners.size).toBe(0);
  });

  it("rejects a file the browser cannot read, and still cleans up", async () => {
    const { deps } = fakeDeps({ fail: true });
    await expect(readVideoDurationMs(new Blob(), deps)).rejects.toThrow("This file could not be read as a video.");
    expect(deps.revokeUrl).toHaveBeenCalled();
  });

  it("rejects a video with no usable length", async () => {
    for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, 0]) {
      const { deps } = fakeDeps({ duration });
      await expect(readVideoDurationMs(new Blob(), deps)).rejects.toThrow("The video length could not be read.");
    }
  });
});

describe("checkDurationMs", () => {
  it("accepts a video up to exactly 180 seconds", () => {
    expect(checkDurationMs(1)).toEqual({ ok: true });
    expect(checkDurationMs(180_000)).toEqual({ ok: true });
  });

  it("refuses a 200-second video with a message that states the limit", () => {
    expect(checkDurationMs(200_000)).toEqual({
      ok: false,
      message: "This video is 200 seconds long. The limit is 180 seconds. Trim it and try again.",
    });
  });

  it("refuses one millisecond over the limit", () => {
    expect(checkDurationMs(180_001).ok).toBe(false);
  });

  it("refuses a length that is not a positive whole number", () => {
    for (const ms of [0, -5, 1.5, Number.NaN]) expect(checkDurationMs(ms).ok).toBe(false);
  });
});
