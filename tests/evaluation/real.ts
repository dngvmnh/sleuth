import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { planFrames } from "@sleuth/evidence-engine";
import {
  MediaError,
  createDeepgramTranscription,
  createGeminiVideoAnalysis,
  extractAudio,
  extractFrames,
  probeDurationMs,
  withTempDir,
  type SampledFrame,
  type TranscriptionProvider,
  type VideoAnalysisProvider,
} from "@sleuth/media";

/** Product limits (`MAX_VIDEO_SECONDS`, `MAX_FRAMES_PER_VIDEO`) and the worker's frame spacing. */
export const MAX_CLIP_MS = 180_000;
export const MAX_FRAMES = 60;
export const FRAME_INTERVAL_MS = 2000;

export interface RealProviders {
  transcription: TranscriptionProvider;
  videoAnalysis: VideoAnalysisProvider;
  /** Provider and model names for the report header. Names only, never a key. */
  label: string;
  /** How many clips switched to the fallback Gemini model. */
  fallbacks: () => number;
}

/**
 * The real adapters from ADR 0007, configured like the worker: `TRANSCRIPTION_API_KEY`,
 * `VIDEO_ANALYSIS_API_KEY`, and optional `TRANSCRIPTION_MODEL`, `VIDEO_ANALYSIS_MODEL`,
 * `VIDEO_ANALYSIS_FALLBACK_MODEL`. Throws `provider_not_configured: <setting> is not set`, naming
 * the setting and never its value.
 *
 * Evaluation clips are our own recordings, so sending their frames to the Gemini free tier is
 * allowed (D-4). Visitors' videos never go through this harness.
 */
export function providersFromEnv(env: Record<string, string | undefined>): RealProviders {
  const value = (name: string) => {
    const v = env[name];
    return v === undefined || v === "" ? undefined : v;
  };
  for (const name of ["TRANSCRIPTION_API_KEY", "VIDEO_ANALYSIS_API_KEY"]) {
    if (!value(name)) throw new Error(`provider_not_configured: ${name} is not set.`);
  }
  const transcriptionModel = value("TRANSCRIPTION_MODEL") ?? "nova-3";
  const videoModel = value("VIDEO_ANALYSIS_MODEL") ?? "gemini-3.8-flash";
  const fallbackModel = value("VIDEO_ANALYSIS_FALLBACK_MODEL") ?? "gemini-3.6-flash";
  let fallbacks = 0;
  return {
    transcription: createDeepgramTranscription({
      apiKey: value("TRANSCRIPTION_API_KEY") ?? "",
      model: transcriptionModel,
    }),
    videoAnalysis: createGeminiVideoAnalysis({
      apiKey: value("VIDEO_ANALYSIS_API_KEY") ?? "",
      model: videoModel,
      fallbackModel,
      maxFrames: MAX_FRAMES,
      onFallback: () => {
        fallbacks += 1;
      },
    }),
    label:
      `deepgram (${transcriptionModel}) + gemini (${videoModel}` +
      (fallbackModel !== videoModel ? `, fallback ${fallbackModel})` : ")"),
    fallbacks: () => fallbacks,
  };
}

/** The FFmpeg steps the harness needs, so a test can replace them. */
export interface EvalMedia {
  probeDurationMs(path: string): Promise<number>;
  extractAudio(inputPath: string, outputPath: string): Promise<void>;
  extractFrames(
    inputPath: string,
    timestampsMs: readonly number[],
    outDir: string,
  ): Promise<SampledFrame[]>;
}

export const realEvalMedia: EvalMedia = { probeDurationMs, extractAudio, extractFrames };

export interface PreparedMedia {
  durationMs: number;
  audioPath: string;
  sampledFrames: SampledFrame[];
}

/**
 * Probes the clip, cuts audio and frames into a temporary folder exactly as the worker does, and
 * hands them to `work`. The folder is deleted afterwards, also when `work` throws.
 */
export function withClipMedia<T>(
  videoPath: string,
  media: EvalMedia,
  work: (prepared: PreparedMedia) => Promise<T>,
): Promise<T> {
  return withTempDir(async (dir) => {
    const durationMs = await media.probeDurationMs(videoPath);
    if (durationMs > MAX_CLIP_MS) throw new MediaError("probe", "duration_exceeded");
    const audioPath = join(dir, "audio.wav");
    await media.extractAudio(videoPath, audioPath);
    const framesDir = join(dir, "frames");
    await mkdir(framesDir);
    const timestamps = planFrames(durationMs, {
      intervalMs: FRAME_INTERVAL_MS,
      maxFrames: MAX_FRAMES,
    });
    const sampledFrames = await media.extractFrames(videoPath, timestamps, framesDir);
    return work({ durationMs, audioPath, sampledFrames });
  }, "sleuth-eval-");
}
