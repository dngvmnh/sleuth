import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { EvidenceCandidate, ProcessingJob } from "@sleuth/contracts";
import { WorkerStoreError, type JobInputs, type WorkerResult, type WorkerStore } from "@sleuth/db";
import { loadGoldenFixture } from "@sleuth/db/fixture";
import {
  MediaError,
  ProviderError,
  createMockTranscriptionProvider,
  createMockVideoAnalysisProvider,
  type AnalyseInput,
  type TranscribeInput,
  type VideoAnalysisProvider,
} from "@sleuth/media";
import { loadConfig } from "./config";
import { downloadVideo } from "./download";
import { runLoop } from "./loop";
import { createProviders, type ProviderSet } from "./providers";
import { JobFailure, describeError, type JobQueue } from "./queue";
import { createSupabaseHandler, type MediaTools } from "./supabase-handler";

const fx = loadGoldenFixture();
const WORKER = "worker-test";
const scratch = mkdtempSync(join(tmpdir(), "sleuth-handler-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const job: ProcessingJob = {
  ...fx.job,
  id: "job-1",
  status: "running",
  attempts: 1,
  lockedBy: WORKER,
};

function inputsOf(over: Partial<JobInputs> = {}): JobInputs {
  return {
    job,
    projectId: fx.project.id,
    owner: { userId: "11111111-1111-4111-8111-111111111111", realAccount: true },
    asset: { ...fx.assetVersion, storagePath: "p/v1/video.mp4" },
    script: fx.script,
    checklist: fx.checklist,
    existingEvidence: [],
    segmentIds: null,
    ...over,
  };
}

interface FakeStore extends WorkerStore {
  written: WorkerResult[];
  loadedWith: [string, string][];
}

function fakeStore(
  inputs: JobInputs | (() => Promise<JobInputs>),
  hooks: { write?: () => Promise<void>; url?: () => Promise<string> } = {},
): FakeStore {
  const store: FakeStore = {
    written: [],
    loadedWith: [],
    loadJobInputs(jobId, workerId) {
      store.loadedWith.push([jobId, workerId]);
      return typeof inputs === "function" ? inputs() : Promise.resolve(inputs);
    },
    createVideoDownloadUrl: () =>
      hooks.url?.() ?? Promise.resolve("https://storage.invalid/signed?token=SECRET-TOKEN"),
    async writeJobResult(_jobId, _workerId, result) {
      await hooks.write?.();
      store.written.push(result);
      return { replacedEvidenceIds: [] };
    },
  };
  return store;
}

/** A provider policy that lets every owner have frames sent; only for tests of other rules. */
const everyone = () => true;

const goldenProviders = (): ProviderSet => ({
  sendsFramesFor: everyone,
  transcription: createMockTranscriptionProvider(fx.transcript),
  videoAnalysis: createMockVideoAnalysisProvider(fx.frames),
});

/** Media tools that need no FFmpeg. They remember the temporary folder they were given. */
function fakeMedia(
  over: Partial<MediaTools> = {},
): MediaTools & { dirs: string[]; frameDirs: string[] } {
  const seen = { dirs: [] as string[], frameDirs: [] as string[] };
  return {
    ...seen,
    async download(_url, destPath) {
      seen.dirs.push(dirname(destPath));
      writeFileSync(destPath, "not really a video");
    },
    probeDurationMs: () => Promise.resolve(fx.assetVersion.durationMs),
    async extractAudio(_input, output) {
      writeFileSync(output, "audio");
    },
    extractFrames: (_input, timestamps, outDir) => {
      seen.frameDirs.push(outDir);
      return Promise.resolve(
        timestamps.map((timestampMs) => ({
          timestampMs,
          path: join(outDir, `f${timestampMs}.jpg`),
        })),
      );
    },
    ...over,
  };
}

const options = (store: WorkerStore, media: MediaTools, over = {}) => ({
  store,
  providers: goldenProviders(),
  workerId: WORKER,
  maxVideoSeconds: 180,
  maxVideoBytes: 1_000_000,
  maxFrames: 60,
  media,
  ...over,
});

const gone = (dirs: string[]) => dirs.length > 0 && dirs.every((d) => !existsSync(d));

describe("createSupabaseHandler", () => {
  it("loads the job under this worker's lease and writes the pipeline result", async () => {
    const store = fakeStore(inputsOf());
    await createSupabaseHandler(options(store, fakeMedia()))(job);
    expect(store.loadedWith).toEqual([["job-1", WORKER]]);
    expect(store.written).toHaveLength(1);
    const [written] = store.written;
    expect(written?.evidence).toEqual(
      fx.expectedEvidence.map((e) => ({ ...e, analysisRunId: "run-job-1" })),
    );
    expect(written?.findings).toEqual(
      fx.expectedFindings.map((f) => ({ ...f, analysisRunId: "run-job-1" })),
    );
    expect(written?.transcript?.length).toBe(fx.transcript.length);
    expect(written?.frames?.length).toBeGreaterThan(0);
  });

  it("hands the audio file and the cut frames to the providers", async () => {
    const seen: { audio?: TranscribeInput; frames?: AnalyseInput } = {};
    const providers: ProviderSet = {
      sendsFramesFor: everyone,
      transcription: {
        name: "spy",
        transcribe(input) {
          seen.audio = input;
          return Promise.resolve([]);
        },
      },
      videoAnalysis: {
        name: "spy",
        analyse(input) {
          seen.frames = input;
          return Promise.resolve([]);
        },
      },
    };
    await createSupabaseHandler(options(fakeStore(inputsOf()), fakeMedia(), { providers }))(job);
    expect(seen.audio?.audioPath).toMatch(/audio\.wav$/);
    expect(seen.audio?.durationMs).toBe(fx.assetVersion.durationMs);
    expect(seen.frames?.frames.length).toBeGreaterThan(1);
    expect(seen.frames?.frames.every((f) => f.path?.endsWith(".jpg"))).toBe(true);
    expect(seen.frames?.frames[0]?.timestampMs).toBe(0);
  });

  it("uses the length of the file, not the length the client declared", async () => {
    const seen: number[] = [];
    const providers: ProviderSet = {
      sendsFramesFor: everyone,
      transcription: {
        name: "spy",
        transcribe(input) {
          seen.push(input.durationMs);
          return Promise.resolve([]);
        },
      },
      videoAnalysis: { name: "spy", analyse: () => Promise.resolve([]) },
    };
    const media = fakeMedia({ probeDurationMs: () => Promise.resolve(12_345) });
    await createSupabaseHandler(options(fakeStore(inputsOf()), media, { providers }))(job);
    expect(seen).toEqual([12_345]);
  });

  it("analyses only the chosen lines of a targeted job and leaves the rest to the stored evidence", async () => {
    const first = fx.script.segments[1];
    expect(first).toBeDefined();
    const store = fakeStore(
      inputsOf({
        segmentIds: [first?.id ?? ""],
        existingEvidence: fx.expectedEvidence as EvidenceCandidate[],
      }),
    );
    await createSupabaseHandler(options(store, fakeMedia()))(job);
    const [written] = store.written;
    expect(written?.evidence.length).toBeGreaterThan(0);
    for (const e of written?.evidence ?? []) expect(e.scriptSegmentId).toBe(first?.id);
  });

  it("deletes its temporary folder after a successful job", async () => {
    const media = fakeMedia();
    await createSupabaseHandler(options(fakeStore(inputsOf()), media))(job);
    expect(gone(media.dirs)).toBe(true);
  });

  it("deletes its temporary folder when the pipeline fails", async () => {
    const media = fakeMedia();
    const providers: ProviderSet = {
      sendsFramesFor: everyone,
      transcription: { name: "boom", transcribe: () => Promise.reject(new Error("boom")) },
      videoAnalysis: { name: "boom", analyse: () => Promise.resolve([]) },
    };
    await expect(
      createSupabaseHandler(options(fakeStore(inputsOf()), media, { providers }))(job),
    ).rejects.toThrow("analyse: failed");
    expect(gone(media.dirs)).toBe(true);
  });

  it("deletes its temporary folder when the result cannot be written", async () => {
    const media = fakeMedia();
    const store = fakeStore(inputsOf(), {
      write: () => Promise.reject(new WorkerStoreError("lease_lost")),
    });
    await expect(createSupabaseHandler(options(store, media))(job)).rejects.toThrow(
      "write: lease_lost",
    );
    expect(gone(media.dirs)).toBe(true);
  });

  it.each([
    "superseded",
    "demo_read_only",
    "lease_lost",
    "upload_missing",
    "job_not_found",
  ] as const)(
    "turns the store refusal %s into a 'load' failure with the same code",
    async (code) => {
      const store = fakeStore(() => Promise.reject(new WorkerStoreError(code)));
      const media = fakeMedia();
      await expect(createSupabaseHandler(options(store, media))(job)).rejects.toThrow(
        new JobFailure("load", code).message,
      );
      expect(media.dirs).toEqual([]);
    },
  );

  it("turns a missing storage client into 'download: not_configured'", async () => {
    const store = fakeStore(inputsOf(), {
      url: () => Promise.reject(new WorkerStoreError("not_configured")),
    });
    await expect(createSupabaseHandler(options(store, fakeMedia()))(job)).rejects.toThrow(
      "download: not_configured",
    );
  });

  it("refuses a video the client declared as too long before downloading it", async () => {
    const media = fakeMedia();
    const long = inputsOf({ asset: { ...fx.assetVersion, durationMs: 181_000 } });
    const download = vi.spyOn(media, "download");
    await expect(createSupabaseHandler(options(fakeStore(long), media))(job)).rejects.toThrow(
      "probe: duration_exceeded",
    );
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses a file that is longer than declared, and cleans up", async () => {
    const media = fakeMedia({ probeDurationMs: () => Promise.resolve(181_000) });
    await expect(createSupabaseHandler(options(fakeStore(inputsOf()), media))(job)).rejects.toThrow(
      "probe: duration_exceeded",
    );
    expect(gone(media.dirs)).toBe(true);
  });

  it("passes a media error through with its step and code", async () => {
    const media = fakeMedia({
      extractAudio: () => Promise.reject(new MediaError("audio", "ffmpeg_missing")),
    });
    await expect(createSupabaseHandler(options(fakeStore(inputsOf()), media))(job)).rejects.toThrow(
      "audio: ffmpeg_missing",
    );
  });

  it("keeps paths, file names and provider text out of the failure message", async () => {
    const secretPath = "C:\\Users\\someone\\private\\video.mp4";
    const media = fakeMedia({
      probeDurationMs: () => Promise.reject(new Error(`ENOENT ${secretPath}`)),
    });
    const error = await createSupabaseHandler(options(fakeStore(inputsOf()), media))(job).catch(
      (e: unknown) => e,
    );
    expect(describeError(error)).toBe("media: failed");

    const providers: ProviderSet = {
      sendsFramesFor: everyone,
      transcription: {
        name: "leaky",
        transcribe: () => Promise.reject(new Error("the presenter said: my password is hunter2")),
      },
      videoAnalysis: { name: "leaky", analyse: () => Promise.resolve([]) },
    };
    const second = await createSupabaseHandler(
      options(fakeStore(inputsOf()), fakeMedia(), { providers }),
    )(job).catch((e: unknown) => e);
    expect(describeError(second)).toBe("analyse: failed");
  });

  it("logs ids and counts only", async () => {
    const lines: string[] = [];
    await createSupabaseHandler(
      options(fakeStore(inputsOf()), fakeMedia(), {
        log: (event: string, fields: Record<string, string | number> = {}) =>
          lines.push(JSON.stringify({ event, ...fields })),
      }),
    )(job);
    expect(lines).toHaveLength(1);
    const logged = lines.join("\n");
    expect(logged).toContain('"jobId":"job-1"');
    expect(logged).not.toMatch(/ProofPay|encrypted|SECRET-TOKEN|storage\.invalid/i);
  });
});

describe("the loop with the Supabase handler", () => {
  it("stores the short failure text on the job row", async () => {
    const failures: string[] = [];
    const queue: JobQueue = {
      claim: vi.fn().mockResolvedValueOnce(job).mockResolvedValue(null),
      heartbeat: () => Promise.resolve(),
      complete: () => Promise.resolve(),
      fail: (_id, _worker, message) => {
        failures.push(message);
        return Promise.resolve("queued");
      },
    };
    const store = fakeStore(() => Promise.reject(new WorkerStoreError("superseded")));
    await runLoop({
      queue,
      handler: createSupabaseHandler(options(store, fakeMedia())),
      workerId: WORKER,
      pollMs: 5,
      heartbeatMs: 1000,
      once: true,
    });
    expect(failures).toEqual(["load: superseded"]);
  });
});

describe("downloadVideo", () => {
  let server: Server | undefined;
  const serve = async (handler: Parameters<typeof createServer>[1]): Promise<string> => {
    server = createServer(handler);
    await new Promise<void>((ready) => server?.listen(0, "127.0.0.1", ready));
    return `http://127.0.0.1:${(server?.address() as AddressInfo).port}/video?token=SECRET-TOKEN`;
  };
  const stop = async () => {
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    server = undefined;
  };

  it("saves the body to the file", async () => {
    const url = await serve((_req, res) => res.end("hello video"));
    const dest = join(scratch, "ok.bin");
    await downloadVideo(url, dest, 1000);
    expect(existsSync(dest)).toBe(true);
    await stop();
  });

  it("fails with http_error on a bad status, without the URL in the message", async () => {
    const url = await serve((_req, res) => {
      res.statusCode = 403;
      res.end("no");
    });
    const error = await downloadVideo(url, join(scratch, "403.bin"), 1000).catch((e: unknown) => e);
    expect(describeError(error)).toBe("download: http_error");
    expect(String(error)).not.toContain("SECRET-TOKEN");
    await stop();
  });

  it("refuses a file that declares more than the limit", async () => {
    const url = await serve((_req, res) => res.end("x".repeat(5000)));
    await expect(downloadVideo(url, join(scratch, "big.bin"), 100)).rejects.toThrow(
      "download: too_large",
    );
    await stop();
  });

  it("stops a stream that has no declared length once it passes the limit", async () => {
    const url = await serve((_req, res) => {
      res.write("x".repeat(80));
      setTimeout(() => res.end("y".repeat(80)), 10);
    });
    await expect(downloadVideo(url, join(scratch, "chunked.bin"), 100)).rejects.toThrow(
      "download: too_large",
    );
    await stop();
  });

  it("gives unreachable when nothing answers", async () => {
    const url = await serve((_req, res) => res.end("x"));
    await stop();
    await expect(downloadVideo(url, join(scratch, "none.bin"), 100)).rejects.toThrow(
      "download: unreachable",
    );
  });
});

describe("createProviders", () => {
  const base = {
    SLEUTH_DATA_MODE: "fixture",
    TRANSCRIPTION_PROVIDER: "mock",
    VIDEO_ANALYSIS_PROVIDER: "mock",
    ALLOW_MOCK_PROVIDERS: false,
    MAX_FRAMES_PER_VIDEO: 60,
  } as const;

  it("gives the mock providers in fixture mode", () => {
    expect(createProviders(base).transcription.name).toBe("mock");
  });

  it("refuses the mock providers in supabase mode unless they are allowed", () => {
    expect(() => createProviders({ ...base, SLEUTH_DATA_MODE: "supabase" })).toThrow(
      /provider_not_configured/,
    );
    expect(() =>
      createProviders({ ...base, SLEUTH_DATA_MODE: "supabase", ALLOW_MOCK_PROVIDERS: true }),
    ).not.toThrow();
  });

  it("refuses a provider name that has no adapter yet", () => {
    expect(() => createProviders({ ...base, TRANSCRIPTION_PROVIDER: "someone" })).toThrow(
      /provider_not_configured.*someone/,
    );
  });

  it("builds the real adapters when the names and keys are set, without echoing the keys", () => {
    const real = {
      ...base,
      SLEUTH_DATA_MODE: "supabase",
      TRANSCRIPTION_PROVIDER: "deepgram",
      VIDEO_ANALYSIS_PROVIDER: "gemini",
      TRANSCRIPTION_API_KEY: "key-one-secret",
      VIDEO_ANALYSIS_API_KEY: "key-two-secret",
    } as const;
    const set = createProviders(real);
    expect(set.transcription.name).toBe("deepgram");
    expect(set.videoAnalysis?.name).toBe("gemini");
    // No mock is involved, so the mock guard does not apply.
    expect(() => createProviders({ ...real, TRANSCRIPTION_API_KEY: undefined })).toThrow(
      /TRANSCRIPTION_API_KEY is not set/,
    );
    const missing = (() => {
      try {
        createProviders({ ...real, VIDEO_ANALYSIS_API_KEY: "" });
      } catch (e) {
        return String(e);
      }
      return "";
    })();
    expect(missing).toMatch(/VIDEO_ANALYSIS_API_KEY is not set/);
    expect(missing).not.toMatch(/secret/);
  });

  it("lets a real provider's failure reach the job row as 'provider: code'", async () => {
    const providers: ProviderSet = {
      sendsFramesFor: everyone,
      transcription: {
        name: "deepgram",
        transcribe: () => Promise.reject(new ProviderError("deepgram", "rate_limited")),
      },
      videoAnalysis: { name: "gemini", analyse: () => Promise.resolve([]) },
    };
    const error = await createSupabaseHandler(
      options(fakeStore(inputsOf()), fakeMedia(), { providers }),
    )(job).catch((e: unknown) => e);
    expect(describeError(error)).toBe("deepgram: rate_limited");
  });

  it("stamps the mock data with the job's project and video version and unique ids", async () => {
    const { transcription, videoAnalysis } = createProviders(base);
    const segments = await transcription.transcribe({
      projectId: "p9",
      assetVersionId: "av9",
      durationMs: 52_000,
    });
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      expect(s.projectId).toBe("p9");
      expect(s.assetVersionId).toBe("av9");
      expect(s.id.startsWith("av9-")).toBe(true);
    }
    const observations = await (videoAnalysis as VideoAnalysisProvider).analyse({
      projectId: "p9",
      assetVersionId: "av9",
      durationMs: 52_000,
      frames: [{ timestampMs: 2000 }],
    });
    expect(observations.map((o) => o.timestampMs)).toEqual([2000]);
    expect(observations[0]?.id.startsWith("av9-")).toBe(true);
  });
});

describe("config", () => {
  it("defaults to the 50 MiB bucket limit and no mock providers in supabase mode", () => {
    const c = loadConfig({});
    expect(c.MAX_VIDEO_BYTES).toBe(52_428_800);
    expect(c.ALLOW_MOCK_PROVIDERS).toBe(false);
    expect(c.TRANSCRIPTION_PROVIDER).toBe("mock");
  });

  it("accepts ALLOW_MOCK_PROVIDERS=1 only", () => {
    expect(loadConfig({ ALLOW_MOCK_PROVIDERS: "1" }).ALLOW_MOCK_PROVIDERS).toBe(true);
    expect(() => loadConfig({ ALLOW_MOCK_PROVIDERS: "yes" })).toThrow();
  });
});

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

// These tests start real FFmpeg processes. In a full parallel `pnpm test` on Windows the child
// processes can be starved past the 5 s default (issue #80), so only these tests get more time.
const FFMPEG_TEST_TIMEOUT_MS = 30_000;

describe.skipIf(!hasFfmpeg)("with real FFmpeg", { timeout: FFMPEG_TEST_TIMEOUT_MS }, () => {
  it("cuts audio and frames from a real clip, hands them to the providers, then cleans up", async () => {
    const clip = join(scratch, "clip.mp4");
    const made = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=6:size=320x240:rate=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=6",
      "-shortest",
      "-pix_fmt",
      "yuv420p",
      clip,
    ]);
    expect(made.status).toBe(0);

    const seen: {
      audioExists?: boolean;
      framePathsExist?: boolean;
      durationMs?: number;
      dirs: string[];
    } = {
      dirs: [],
    };
    const providers: ProviderSet = {
      sendsFramesFor: everyone,
      transcription: {
        name: "spy",
        transcribe(input) {
          seen.audioExists = input.audioPath ? existsSync(input.audioPath) : false;
          seen.durationMs = input.durationMs;
          if (input.audioPath) seen.dirs.push(dirname(input.audioPath));
          return Promise.resolve([]);
        },
      },
      videoAnalysis: {
        name: "spy",
        analyse(input) {
          seen.framePathsExist =
            input.frames.length > 0 && input.frames.every((f) => f.path && existsSync(f.path));
          return Promise.resolve([]);
        },
      },
    };
    const realTools: Partial<MediaTools> = {
      download: async (_url, destPath) => {
        await copyFile(clip, destPath);
      },
    };
    const { realMedia } = await import("./supabase-handler");
    const store = fakeStore(inputsOf({ asset: { ...fx.assetVersion, durationMs: 6000 } }));
    await createSupabaseHandler(
      options(store, { ...realMedia, ...realTools }, { providers, maxFrames: 5 }),
    )(job);

    expect(seen.audioExists).toBe(true);
    expect(seen.framePathsExist).toBe(true);
    expect(seen.durationMs).toBeGreaterThanOrEqual(5800);
    expect(seen.durationMs).toBeLessThanOrEqual(6300);
    expect(seen.dirs.length).toBe(1);
    expect(existsSync(seen.dirs[0] ?? "")).toBe(false);
    expect(store.written).toHaveLength(1);
  });

  it("fails cleanly on a file that is not a video, and leaves nothing behind", async () => {
    let dir = "";
    const tools: MediaTools = {
      ...(await import("./supabase-handler")).realMedia,
      download: async (_url, destPath) => {
        dir = dirname(destPath);
        writeFileSync(destPath, "this is not a video");
      },
    };
    const error = await createSupabaseHandler(options(fakeStore(inputsOf()), tools))(job).catch(
      (e: unknown) => e,
    );
    expect(describeError(error)).toMatch(/^probe: (ffmpeg_failed|duration_unreadable)$/);
    expect(existsSync(dir)).toBe(false);
  });
});
