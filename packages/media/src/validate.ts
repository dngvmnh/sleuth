import {
  FrameObservationSchema,
  TranscriptSegmentSchema,
  type FrameObservation,
  type TranscriptSegment,
} from "@sleuth/contracts";

export interface ValidationReport<T> {
  valid: T[];
  /** Count only. Never log the rejected content. */
  rejectedCount: number;
}

/** Keep provider output only if it parses and sits inside 0..durationMs. */
export function validateTranscript(
  raw: readonly unknown[],
  durationMs: number,
): ValidationReport<TranscriptSegment> {
  const valid: TranscriptSegment[] = [];
  for (const item of raw) {
    const parsed = TranscriptSegmentSchema.safeParse(item);
    if (parsed.success && parsed.data.endMs <= durationMs) valid.push(parsed.data);
  }
  return { valid, rejectedCount: raw.length - valid.length };
}

export function validateObservations(
  raw: readonly unknown[],
  durationMs: number,
): ValidationReport<FrameObservation> {
  const valid: FrameObservation[] = [];
  for (const item of raw) {
    const parsed = FrameObservationSchema.safeParse(item);
    if (parsed.success && parsed.data.timestampMs <= durationMs) valid.push(parsed.data);
  }
  return { valid, rejectedCount: raw.length - valid.length };
}
