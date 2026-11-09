import { loadGoldenFixture } from "@sleuth/db/fixture";
import type { TranscriptionProvider, VideoAnalysisProvider } from "@sleuth/media";
import type { WorkerConfig } from "./config";

export interface ProviderSet {
  transcription: TranscriptionProvider;
  videoAnalysis: VideoAnalysisProvider;
}

/**
 * The mock providers of supabase mode: the golden fixture's transcript and frames, stamped with
 * the job's project and video version and given ids that are unique to that video, so a retry
 * writes the same rows. They ignore the audio and the pictures. For local testing only.
 */
function createFixtureBackedMocks(): ProviderSet {
  const fx = loadGoldenFixture();
  return {
    transcription: {
      name: "mock",
      transcribe: ({ projectId, assetVersionId }) =>
        Promise.resolve(
          fx.transcript.map((s) => ({
            ...s,
            id: `${assetVersionId}-${s.id}`,
            projectId,
            assetVersionId,
          })),
        ),
    },
    videoAnalysis: {
      name: "mock",
      analyse: ({ projectId, assetVersionId, frames }) => {
        const wanted = new Set(frames.map((f) => f.timestampMs));
        return Promise.resolve(
          fx.frames
            .filter((o) => wanted.has(o.timestampMs))
            .map((o) => ({ ...o, id: `${assetVersionId}-${o.id}`, projectId, assetVersionId })),
        );
      },
    },
  };
}

/**
 * Picks the providers named in the config. Throws a `provider_not_configured: ...` error, which
 * stops the worker at start-up rather than failing every job one by one.
 */
export function createProviders(
  config: Pick<
    WorkerConfig,
    | "SLEUTH_DATA_MODE"
    | "TRANSCRIPTION_PROVIDER"
    | "VIDEO_ANALYSIS_PROVIDER"
    | "ALLOW_MOCK_PROVIDERS"
  >,
): ProviderSet {
  const names = [config.TRANSCRIPTION_PROVIDER, config.VIDEO_ANALYSIS_PROVIDER];
  const unknown = names.find((name) => name !== "mock");
  if (unknown !== undefined) {
    throw new Error(
      `provider_not_configured: "${unknown}" has no adapter yet (evidence-analysis task 10). Use "mock".`,
    );
  }
  if (config.SLEUTH_DATA_MODE === "supabase" && !config.ALLOW_MOCK_PROVIDERS) {
    throw new Error(
      "provider_not_configured: the mock providers return the golden fixture whatever the video shows, " +
        "so supabase mode refuses them. Set ALLOW_MOCK_PROVIDERS=1 for local testing only.",
    );
  }
  return createFixtureBackedMocks();
}
