import { MAX_VIDEO_MS, MAX_VIDEO_SECONDS } from "@sleuth/contracts";

/** The part of a <video> element used to read a duration. Tests pass a stub. */
export interface MetadataVideo {
  preload: string;
  src: string;
  readonly duration: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  removeAttribute(name: string): void;
  load(): void;
}

export interface DurationDeps {
  createVideo: () => MetadataVideo;
  createUrl: (file: Blob) => string;
  revokeUrl: (url: string) => void;
}

const browserDeps = (): DurationDeps => ({
  createVideo: () => document.createElement("video"),
  createUrl: (file) => URL.createObjectURL(file),
  revokeUrl: (url) => URL.revokeObjectURL(url),
});

export class DurationReadError extends Error {}

/**
 * Read a video's length in the browser, in whole ms. Only the metadata is loaded, and
 * the file never leaves the device here. Rejects when the browser cannot read the file.
 */
export function readVideoDurationMs(file: Blob, deps: DurationDeps = browserDeps()): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = deps.createVideo();
    const url = deps.createUrl(file);
    const done = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
      deps.revokeUrl(url);
    };
    const onMeta = () => {
      const seconds = video.duration;
      done();
      if (!Number.isFinite(seconds) || seconds <= 0) {
        reject(new DurationReadError("The video length could not be read."));
        return;
      }
      resolve(Math.round(seconds * 1000));
    };
    const onError = () => {
      done();
      reject(new DurationReadError("This file could not be read as a video."));
    };
    video.preload = "metadata";
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("error", onError);
    video.src = url;
  });
}

export type DurationCheck = { ok: true } | { ok: false; message: string };

/** The 180-second MVP limit, checked before anything is sent to the server. */
export function checkDurationMs(durationMs: number): DurationCheck {
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    return { ok: false, message: "The video length could not be read." };
  }
  if (durationMs > MAX_VIDEO_MS) {
    const seconds = Math.ceil(durationMs / 1000);
    return {
      ok: false,
      message: `This video is ${seconds} seconds long. The limit is ${MAX_VIDEO_SECONDS} seconds. Trim it and try again.`,
    };
  }
  return { ok: true };
}
