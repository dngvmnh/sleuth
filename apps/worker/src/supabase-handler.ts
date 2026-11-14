import { mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { planFrames, runPipeline } from "@sleuth/evidence-engine";
import { WorkerStoreError, type WorkerStore } from "@sleuth/db";
import {
  MediaError,
  ProviderError,
  extractAudio,
  extractFrames,
  probeDurationMs,
  withTempDir,
  type SampledFrame,
} from "@sleuth/media";
import { downloadVideo } from "./download";
import type { JobHandler } from "./handlers";
import type { ProviderSet } from "./providers";
import { JobFailure } from "./queue";

/** The outside world the handler touches, so a test can replace it with fakes. */
export interface MediaTools {
  download(url: string, destPath: string, maxBytes: number): Promise<void>;
  probeDurationMs(path: string): Promise<number>;
  extractAudio(inputPath: string, outputPath: string): Promise<void>;
  extractFrames(
    inputPath: string,
    timestampsMs: readonly number[],
    outDir: string,
  ): Promise<SampledFrame[]>;
}

export const realMedia: MediaTools = {
  download: (url, destPath, maxBytes) => downloadVideo(url, destPath, maxBytes),
  probeDurationMs: (path) => probeDurationMs(path),
  extractAudio: (inputPath, outputPath) => extractAudio(inputPath, outputPath),
  extractFrames: (inputPath, timestampsMs, outDir) =>
    extractFrames(inputPath, timestampsMs, outDir),
};

export interface SupabaseHandlerOptions {
  store: WorkerStore;
  providers: ProviderSet;
  /** The id the queue claimed the job with. Every store call checks this lease. */
  workerId: string;
  maxVideoSeconds: number;
  maxVideoBytes: number;
  maxFrames: number;
  /** Distance between sampled frames before the budget widens it. Default 2000 ms. */
  frameIntervalMs?: number;
  media?: MediaTools;
  /** Job ids, counts and step names only. */
  log?: (event: string, fields?: Record<string, string | number>) => void;
}

/** Runs `work`; turns any failure into a short `step: code` message that is safe to store. */
async function step<T>(name: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof JobFailure ||
      error instanceof MediaError ||
      error instanceof ProviderError
    )
      throw error;
    if (error instanceof WorkerStoreError) throw new JobFailure(name, error.code);
    throw new JobFailure(name, "failed");
  }
}

function videoExtension(storagePath: string): string {
  const ext = extname(storagePath).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : ".bin";
}

/**
 * Supabase mode (evidence-analysis 12, `docs/worker-supabase-contract.md`): load the claimed job,
 * download its video into a per-job temporary folder, probe it, cut audio and frames, run the
 * pipeline, and write the result in one transaction. The queue loop sends the heartbeats and calls
 * `complete` or `fail`; this handler never changes the job's status. The temporary folder is
 * deleted whether the job succeeds or fails.
 *
 * Failures are `step: code` (see `JobFailure`, `MediaError`, `WorkerStoreError`): no file names,
 * transcripts, frames or URLs. When the lease is lost the later `fail` call from the loop does
 * nothing, because it only touches rows this worker holds.
 */
export function createSupabaseHandler(options: SupabaseHandlerOptions): JobHandler {
  const media = options.media ?? realMedia;
  const log = options.log ?? (() => undefined);
  const maxMs = options.maxVideoSeconds * 1000;
  const frameIntervalMs = options.frameIntervalMs ?? 2000;

  return async (job) => {
    const inputs = await step("load", () => options.store.loadJobInputs(job.id, options.workerId));
    if (inputs.asset.durationMs > maxMs) throw new MediaError("probe", "duration_exceeded");
    // Decision D-4: frames leave this machine only when the provider set allows it for this owner.
    const videoAnalysis =
      options.providers.videoAnalysis !== null && options.providers.sendsFramesFor(inputs.owner)
        ? options.providers.videoAnalysis
        : null;
    const url = await step("download", () => options.store.createVideoDownloadUrl(inputs));

    const produced = await step("media", () =>
      withTempDir(async (dir) => {
        const videoPath = join(dir, `video${videoExtension(inputs.asset.storagePath)}`);
        await media.download(url, videoPath, options.maxVideoBytes);

        // The file's own length is the truth; the client-declared length was only a first check.
        const durationMs = await media.probeDurationMs(videoPath);
        if (durationMs > maxMs) throw new MediaError("probe", "duration_exceeded");

        const audioPath = join(dir, "audio.wav");
        await media.extractAudio(videoPath, audioPath);
        // Speech only: no frame folder, no frame files, nothing for a video provider to read.
        let sampledFrames: SampledFrame[] = [];
        if (videoAnalysis !== null) {
          const framesDir = join(dir, "frames");
          await mkdir(framesDir);
          const timestamps = planFrames(durationMs, {
            intervalMs: frameIntervalMs,
            maxFrames: options.maxFrames,
          });
          sampledFrames = await media.extractFrames(videoPath, timestamps, framesDir);
        }

        const result = await step("analyse", () =>
          runPipeline({
            projectId: inputs.projectId,
            assetVersionId: inputs.asset.id,
            durationMs,
            analysisRunId: `run-${job.id}`,
            segments: inputs.script.segments,
            checklist: inputs.checklist,
            transcription: options.providers.transcription,
            videoAnalysis,
            frameIntervalMs,
            maxFrames: options.maxFrames,
            audioPath,
            ...(videoAnalysis !== null ? { sampledFrames } : {}),
            ...(inputs.segmentIds ? { segmentIds: inputs.segmentIds } : {}),
            existingEvidence: inputs.existingEvidence,
          }),
        );
        return { result, durationMs, frameCount: sampledFrames.length };
      }, "sleuth-job-"),
    );

    const { result } = produced;
    await step("write", () =>
      options.store.writeJobResult(job.id, options.workerId, {
        evidence: result.evidence,
        findings: result.findings,
        transcript: result.transcript,
        frames: result.observations,
      }),
    );
    log("analysed", {
      jobId: job.id,
      durationMs: produced.durationMs,
      frames: produced.frameCount,
      speechOnly: videoAnalysis === null ? 1 : 0,
      transcriptSegments: result.transcript.length,
      evidence: result.evidence.length,
      findings: result.findings.length,
      rejectedTranscriptItems: result.rejectedTranscriptItems,
      rejectedObservations: result.rejectedObservations,
      targeted: inputs.segmentIds ? inputs.segmentIds.length : 0,
    });
  };
}
