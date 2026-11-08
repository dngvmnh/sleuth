import type { FrameObservation, TranscriptSegment } from "@sleuth/contracts";
import type { TranscriptionProvider, VideoAnalysisProvider } from "./providers";

/** Returns canned transcript segments. No network, no keys. */
export function createMockTranscriptionProvider(
  canned: readonly TranscriptSegment[],
): TranscriptionProvider {
  return {
    name: "mock",
    async transcribe({ assetVersionId }) {
      return canned.filter((s) => s.assetVersionId === assetVersionId);
    },
  };
}

/** Returns canned observations for the frames requested (same timestamps). No network, no keys. */
export function createMockVideoAnalysisProvider(
  canned: readonly FrameObservation[],
): VideoAnalysisProvider {
  return {
    name: "mock",
    async analyse({ assetVersionId, frames }) {
      const wanted = new Set(frames.map((f) => f.timestampMs));
      return canned.filter((o) => o.assetVersionId === assetVersionId && wanted.has(o.timestampMs));
    },
  };
}
