import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MediaError,
  extractAudio,
  extractFrames,
  probeDurationMs,
  withTempDir,
} from "./ffmpeg";

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

function makeClip(dir: string, withAudio: boolean): string {
  const out = join(dir, withAudio ? "clip.mp4" : "silent.mp4");
  const args = ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=10"];
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-shortest");
  args.push("-pix_fmt", "yuv420p", out);
  const result = spawnSync("ffmpeg", args);
  if (result.status !== 0) throw new Error("could not build the test clip");
  return out;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("withTempDir", () => {
  it("removes the folder after the work finishes", async () => {
    let seen = "";
    await withTempDir(async (dir) => {
      seen = dir;
      await writeFile(join(dir, "a.txt"), "x");
    });
    expect(await pathExists(seen)).toBe(false);
  });

  it("removes the folder when the work throws", async () => {
    let seen = "";
    await expect(
      withTempDir(async (dir) => {
        seen = dir;
        await writeFile(join(dir, "a.txt"), "x");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(seen).not.toBe("");
    expect(await pathExists(seen)).toBe(false);
  });
});

describe("MediaError", () => {
  it("names the step and the code and nothing else", () => {
    const error = new MediaError("probe", "ffmpeg_missing");
    expect(error.message).toBe("probe: ffmpeg_missing");
    expect(error.step).toBe("probe");
    expect(error.code).toBe("ffmpeg_missing");
  });
});

describe("missing FFmpeg binary", () => {
  const missing = { ffmpegPath: "sleuth-no-such-ffmpeg", ffprobePath: "sleuth-no-such-ffprobe" };

  it("gives ffmpeg_missing when probing", async () => {
    await expect(probeDurationMs("in.mp4", missing)).rejects.toMatchObject({
      step: "probe",
      code: "ffmpeg_missing",
    });
  });

  it("gives ffmpeg_missing when extracting audio", async () => {
    await expect(extractAudio("in.mp4", "out.wav", missing)).rejects.toMatchObject({
      step: "audio",
      code: "ffmpeg_missing",
    });
  });

  it("gives ffmpeg_missing when extracting frames", async () => {
    await withTempDir(async (dir) => {
      await expect(extractFrames("in.mp4", [0], dir, missing)).rejects.toMatchObject({
        step: "frames",
        code: "ffmpeg_missing",
      });
    });
  });
});

describe("extractFrames input checks", () => {
  it("rejects fractional and negative timestamps before running anything", async () => {
    await expect(extractFrames("in.mp4", [1.5], ".")).rejects.toMatchObject({
      code: "invalid_timestamp",
    });
    await expect(extractFrames("in.mp4", [-1], ".")).rejects.toMatchObject({
      code: "invalid_timestamp",
    });
  });
});

describe.skipIf(!hasFfmpeg)("FFmpeg on a generated clip", () => {
  let workDir = "";
  let clip = "";
  let silentClip = "";

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "sleuth-ffmpeg-test-"));
    clip = makeClip(workDir, true);
    silentClip = makeClip(workDir, false);
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });
  it("reads the duration in whole milliseconds", async () => {
    const ms = await probeDurationMs(clip);
    expect(Number.isInteger(ms)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(2900);
    expect(ms).toBeLessThanOrEqual(3200);
  });

  it("fails with duration_unreadable or ffmpeg_failed on a file that is not media", async () => {
    const bad = join(workDir, "bad.mp4");
    await writeFile(bad, "not a video");
    await expect(probeDurationMs(bad)).rejects.toMatchObject({ step: "probe" });
    await expect(probeDurationMs(bad)).rejects.toThrow(/^probe: (ffmpeg_failed|duration_unreadable)$/);
  });

  it("extracts mono 16 kHz audio that lasts about as long as the clip", async () => {
    const wav = join(workDir, "audio.wav");
    await extractAudio(clip, wav);
    expect(await pathExists(wav)).toBe(true);
    const probe = spawnSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=channels,sample_rate",
      "-of",
      "csv=p=0",
      wav,
    ]);
    expect(String(probe.stdout).trim()).toBe("16000,1");
    const ms = await probeDurationMs(wav);
    expect(ms).toBeGreaterThanOrEqual(2900);
  });

  it("gives no_audio_stream for a clip without sound", async () => {
    await expect(extractAudio(silentClip, join(workDir, "silent.wav"))).rejects.toMatchObject({
      step: "audio",
      code: "no_audio_stream",
    });
  });

  it("writes one picture per timestamp and returns them in order", async () => {
    const outDir = join(workDir, "frames");
    await mkdir(outDir);
    const frames = await extractFrames(clip, [0, 1000, 2000], outDir);
    expect(frames.map((f) => f.timestampMs)).toEqual([0, 1000, 2000]);
    const files = await readdir(outDir);
    expect(files).toHaveLength(3);
    for (const frame of frames) expect(await pathExists(frame.path ?? "")).toBe(true);
  });

  it("gives timeout when the call runs out of time", async () => {
    await expect(probeDurationMs(clip, { timeoutMs: 1 })).rejects.toMatchObject({
      step: "probe",
      code: "timeout",
    });
  });
});
