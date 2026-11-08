import type { ChecklistItem, ScriptSegment } from "@sleuth/contracts";
import {
  validateObservations,
  validateTranscript,
  type TranscriptionProvider,
  type VideoAnalysisProvider,
} from "@sleuth/media";
import { analyse, type EngineOutput } from "./analyse";
import { planFrames } from "./frames";

export interface PipelineOptions {
  projectId: string;
  assetVersionId: string;
  durationMs: number;
  analysisRunId: string;
  segments: readonly ScriptSegment[];
  checklist: readonly ChecklistItem[];
  transcription: TranscriptionProvider;
  videoAnalysis: VideoAnalysisProvider;
  frameIntervalMs: number;
  maxFrames: number;
}

export interface PipelineResult extends EngineOutput {
  /** Counts only. Never the rejected content. */
  rejectedTranscriptItems: number;
  rejectedObservations: number;
}

/** Transcribe, sample frames, analyse, validate timestamps, then match. Works with mocks or real providers. */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { projectId, assetVersionId, durationMs } = options;
  const rawTranscript = await options.transcription.transcribe({
    projectId,
    assetVersionId,
    durationMs,
  });
  const frames = planFrames(durationMs, {
    intervalMs: options.frameIntervalMs,
    maxFrames: options.maxFrames,
  }).map((timestampMs) => ({ timestampMs }));
  const rawObservations = await options.videoAnalysis.analyse({
    projectId,
    assetVersionId,
    durationMs,
    frames,
  });
  const transcript = validateTranscript(rawTranscript, durationMs);
  const observations = validateObservations(rawObservations, durationMs);

  const out = analyse({
    projectId,
    assetVersionId,
    durationMs,
    analysisRunId: options.analysisRunId,
    segments: options.segments,
    checklist: options.checklist,
    transcript: transcript.valid,
    observations: observations.valid,
  });
  return {
    ...out,
    rejectedTranscriptItems: transcript.rejectedCount,
    rejectedObservations: observations.rejectedCount,
  };
}
