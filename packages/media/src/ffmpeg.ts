import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SampledFrame } from "./providers";

export type MediaStep = "probe" | "audio" | "frames";

export type MediaErrorCode =
  | "ffmpeg_missing"
  | "ffmpeg_failed"
  | "timeout"
  | "duration_unreadable"
  | "duration_exceeded"
  | "no_audio_stream"
  | "invalid_timestamp"
  | "no_frames";

/**
 * Failure of a media step. The message is `step: code` and never holds a path, file content or
 * FFmpeg output, so it is safe to store as a job error.
 */
export class MediaError extends Error {
  readonly step: MediaStep;
  readonly code: MediaErrorCode;

  constructor(step: MediaStep, code: MediaErrorCode) {
    super(`${step}: ${code}`);
    this.name = "MediaError";
    this.step = step;
    this.code = code;
  }
}

export interface FfmpegOptions {
  /** Binary names or paths. Default to `ffmpeg` and `ffprobe` on PATH. */
  ffmpegPath?: string;
  ffprobePath?: string;
  /** Kill a call that runs longer than this. Default 60 000 ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

interface RunResult {
  stdout: string;
  stderr: string;
}

/** Runs a binary with an argument array (no shell). Failures become `MediaError`. */
function run(
  step: MediaStep,
  binary: string,
  args: readonly string[],
  timeoutMs: number,
  onFailure?: (stderr: string) => MediaErrorCode | undefined,
): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      binary,
      [...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolvePromise({ stdout: String(stdout), stderr: String(stderr) });
          return;
        }
        const failure = error as NodeJS.ErrnoException & { killed?: boolean };
        if (failure.code === "ENOENT") return reject(new MediaError(step, "ffmpeg_missing"));
        if (failure.killed === true) return reject(new MediaError(step, "timeout"));
        const specific = onFailure?.(String(stderr));
        reject(new MediaError(step, specific ?? "ffmpeg_failed"));
      },
    );
  });
}

/** Duration of a media file in whole milliseconds. */
export async function probeDurationMs(
  inputPath: string,
  options: FfmpegOptions = {},
): Promise<number> {
  const { stdout } = await run(
    "probe",
    options.ffprobePath ?? "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      "-i",
      resolve(inputPath),
    ],
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new MediaError("probe", "duration_unreadable");
  return Math.round(seconds * 1000);
}

/** Writes mono 16 kHz 16-bit WAV audio, the format speech-to-text providers expect. */
export async function extractAudio(
  inputPath: string,
  outputPath: string,
  options: FfmpegOptions = {},
): Promise<void> {
  await run(
    "audio",
    options.ffmpegPath ?? "ffmpeg",
    [
      "-nostdin",
      "-y",
      "-v",
      "error",
      "-i",
      resolve(inputPath),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      resolve(outputPath),
    ],
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    (stderr) =>
      /does not contain any stream|matches no streams/i.test(stderr)
        ? "no_audio_stream"
        : undefined,
  );
}

/**
 * Writes one JPEG per timestamp into `outDir` and returns the frames that were produced, in the
 * order asked. A timestamp at the very end of a file can yield no picture; it is left out. If
 * nothing at all was produced, the step fails with `no_frames`.
 */
export async function extractFrames(
  inputPath: string,
  timestampsMs: readonly number[],
  outDir: string,
  options: FfmpegOptions = {},
): Promise<SampledFrame[]> {
  for (const t of timestampsMs) {
    if (!Number.isInteger(t) || t < 0) throw new MediaError("frames", "invalid_timestamp");
  }
  const input = resolve(inputPath);
  const frames: SampledFrame[] = [];
  for (const [index, timestampMs] of timestampsMs.entries()) {
    const path = resolve(join(outDir, `frame-${String(index).padStart(4, "0")}.jpg`));
    try {
      await run(
        "frames",
        options.ffmpegPath ?? "ffmpeg",
        [
          "-nostdin",
          "-y",
          "-v",
          "error",
          "-ss",
          (timestampMs / 1000).toFixed(3),
          "-i",
          input,
          "-frames:v",
          "1",
          "-q:v",
          "5",
          path,
        ],
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
    } catch (error) {
      // Seeking to the very end of a file leaves nothing to decode and FFmpeg exits with an error.
      // That is "no picture here", not a broken file; a broken file ends in `no_frames` below.
      // A missing binary or a timeout is still a failure.
      if (!(error instanceof MediaError && error.code === "ffmpeg_failed")) throw error;
    }
    if (await exists(path)) frames.push({ timestampMs, path });
  }
  if (timestampsMs.length > 0 && frames.length === 0) throw new MediaError("frames", "no_frames");
  return frames;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs `fn` with a fresh temporary folder and always deletes the folder afterwards, including
 * when `fn` throws.
 */
export async function withTempDir<T>(
  fn: (dir: string) => Promise<T>,
  prefix = "sleuth-",
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
