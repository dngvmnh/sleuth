import type { FrameObservation, TranscriptSegment } from "@sleuth/contracts";

export interface TranscribeInput {
  projectId: string;
  assetVersionId: string;
  durationMs: number;
  /** Path of the extracted audio on the worker's disk. Real providers read it; mocks ignore it. */
  audioPath?: string;
}

/** Speech to text with word-level timestamps. Output is untrusted: validate before use. */
export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscribeInput): Promise<TranscriptSegment[]>;
}

export interface SampledFrame {
  timestampMs: number;
  /** Path of the frame image on the worker's disk. Real providers read it; mocks ignore it. */
  path?: string;
}

export interface AnalyseInput {
  projectId: string;
  assetVersionId: string;
  durationMs: number;
  frames: SampledFrame[];
}

/**
 * Looks at sampled frames (or a short clip) and returns timestamped observations,
 * including text read from the screen. A separate OCR stage is optional.
 */
export interface VideoAnalysisProvider {
  readonly name: string;
  analyse(input: AnalyseInput): Promise<FrameObservation[]>;
}
