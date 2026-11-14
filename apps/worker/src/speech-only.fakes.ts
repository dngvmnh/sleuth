/**
 * Test helpers for the speech-only mode (decision D-4). No network, no keys, no FFmpeg.
 * Not imported by the worker itself.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProcessingJob } from "@sleuth/contracts";
import type { JobInputs, JobOwner, WorkerResult, WorkerStore } from "@sleuth/db";
import { loadGoldenFixture } from "@sleuth/db/fixture";
import {
  createMockTranscriptionProvider,
  createMockVideoAnalysisProvider,
  type VideoAnalysisProvider,
} from "@sleuth/media";
import { geminiFramesAllowed, type ProviderSet } from "./providers";
import type { MediaTools } from "./supabase-handler";

export const fx = loadGoldenFixture();
export const WORKER = "worker-speech-test";
/** Planted in the fake client and the fake transcript so a test can grep logs and errors for it. */
export const FAKE_KEY = "fake-gemini-key-do-not-print";

export const job: ProcessingJob = {
  ...fx.job,
  id: "job-speech-1",
  status: "running",
  attempts: 1,
  lockedBy: WORKER,
};

export function inputsFor(owner: JobOwner): JobInputs {
  return {
    job,
    projectId: fx.project.id,
    owner,
    asset: { ...fx.assetVersion, storagePath: "p/v1/video.mp4" },
    script: fx.script,
    checklist: fx.checklist,
    existingEvidence: [],
    segmentIds: null,
  };
}

export function fakeStore(inputs: JobInputs): WorkerStore & { written: WorkerResult[] } {
  const written: WorkerResult[] = [];
  return {
    written,
    loadJobInputs: () => Promise.resolve(inputs),
    createVideoDownloadUrl: () => Promise.resolve("https://storage.invalid/signed?token=T"),
    writeJobResult(_jobId, _workerId, result) {
      written.push(result);
      return Promise.resolve({ replacedEvidenceIds: [] });
    },
  };
}

/** Media tools that write placeholder files and count frame extraction. */
export function fakeMedia(): MediaTools & { frameCalls: number; frameDirs: string[] } {
  const seen = { frameCalls: 0, frameDirs: [] as string[] };
  return {
    get frameCalls() {
      return seen.frameCalls;
    },
    frameDirs: seen.frameDirs,
    async download(_url, destPath) {
      writeFileSync(destPath, "not really a video");
    },
    probeDurationMs: () => Promise.resolve(fx.assetVersion.durationMs),
    async extractAudio(_input, output) {
      writeFileSync(output, "audio");
    },
    extractFrames(_input, timestamps, outDir) {
      seen.frameCalls += 1;
      seen.frameDirs.push(outDir);
      return Promise.resolve(
        timestamps.map((timestampMs) => ({
          timestampMs,
          path: join(outDir, `f${timestampMs}.jpg`),
        })),
      );
    },
  };
}

/** Stands in for the Gemini client: answers with the golden frames and counts calls. */
export function fakeGemini(): VideoAnalysisProvider & { calls: number } {
  const inner = createMockVideoAnalysisProvider(fx.frames);
  const client = {
    name: "gemini",
    calls: 0,
    analyse(input: Parameters<VideoAnalysisProvider["analyse"]>[0]) {
      client.calls += 1;
      return inner.analyse(input);
    },
  };
  return client;
}

/** The real `gemini` rule from `createProviders`, with a fake client. */
export function geminiSet(
  ownerIds: string[],
  client = fakeGemini(),
): ProviderSet & {
  client: ReturnType<typeof fakeGemini>;
} {
  return {
    client,
    transcription: createMockTranscriptionProvider(fx.transcript),
    videoAnalysis: client,
    sendsFramesFor: (owner) => geminiFramesAllowed(owner, ownerIds),
  };
}

export const handlerOptions = (store: WorkerStore, providers: ProviderSet, media: MediaTools) => ({
  store,
  providers,
  workerId: WORKER,
  maxVideoSeconds: 180,
  maxVideoBytes: 1_000_000,
  maxFrames: 60,
  media,
});
