import type {
  ChecklistItem,
  EvidenceCandidate,
  FrameObservation,
  ScriptSegment,
  TranscriptSegment,
} from "@sleuth/contracts";
import {
  validateObservations,
  validateTranscript,
  type SampledFrame,
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
  /** Path of the extracted audio, for providers that read a file. Mocks ignore it. */
  audioPath?: string;
  /**
   * Frames already cut from the video (with their file paths). When given they replace the plan
   * made from `frameIntervalMs` and `maxFrames`.
   */
  sampledFrames?: readonly SampledFrame[];
  /** Analyse only these script lines (a re-analysis). Omit for a full run. */
  segmentIds?: readonly string[];
  /** Evidence already stored for the project; a targeted run uses it for the Ghost check. */
  existingEvidence?: readonly EvidenceCandidate[];
}

export interface PipelineResult extends EngineOutput {
  /** Counts only. Never the rejected content. */
  rejectedTranscriptItems: number;
  rejectedObservations: number;
  /** What the providers returned after validation. The worker stores these as proof for the UI. */
  transcript: TranscriptSegment[];
  observations: FrameObservation[];
}

/** Transcribe, sample frames, analyse, validate timestamps, then match. Works with mocks or real providers. */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { projectId, assetVersionId, durationMs } = options;
  const rawTranscript = await options.transcription.transcribe({
    projectId,
    assetVersionId,
    durationMs,
    ...(options.audioPath ? { audioPath: options.audioPath } : {}),
  });
  const frames: SampledFrame[] = options.sampledFrames
    ? [...options.sampledFrames]
    : planFrames(durationMs, {
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
    ...(options.segmentIds ? { segmentIds: options.segmentIds } : {}),
    ...(options.existingEvidence ? { existingEvidence: options.existingEvidence } : {}),
  });
  return {
    ...out,
    rejectedTranscriptItems: transcript.rejectedCount,
    rejectedObservations: observations.rejectedCount,
    transcript: transcript.valid,
    observations: observations.valid,
  };
}
