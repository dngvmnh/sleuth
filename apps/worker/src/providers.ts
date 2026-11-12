import { loadGoldenFixture } from "@sleuth/db/fixture";
import {
  createDeepgramTranscription,
  createGeminiVideoAnalysis,
  type ProviderUsage,
  type TranscriptionProvider,
  type VideoAnalysisProvider,
} from "@sleuth/media";
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

export type ProviderConfig = Pick<
  WorkerConfig,
  | "SLEUTH_DATA_MODE"
  | "TRANSCRIPTION_PROVIDER"
  | "VIDEO_ANALYSIS_PROVIDER"
  | "ALLOW_MOCK_PROVIDERS"
  | "MAX_FRAMES_PER_VIDEO"
> &
  Partial<
    Pick<
      WorkerConfig,
      | "TRANSCRIPTION_API_KEY"
      | "VIDEO_ANALYSIS_API_KEY"
      | "TRANSCRIPTION_MODEL"
      | "VIDEO_ANALYSIS_MODEL"
      | "VIDEO_ANALYSIS_FALLBACK_MODEL"
    >
  >;

const TRANSCRIPTION_NAMES = ["mock", "deepgram"] as const;
const VIDEO_ANALYSIS_NAMES = ["mock", "gemini"] as const;

/**
 * Picks the providers named in the config. Throws a `provider_not_configured: ...` error, which
 * stops the worker at start-up rather than failing every job one by one. The messages name the
 * setting, never its value.
 */
export function createProviders(
  config: ProviderConfig,
  onUsage?: (usage: ProviderUsage) => void,
): ProviderSet {
  const transcriptionName = config.TRANSCRIPTION_PROVIDER;
  const videoName = config.VIDEO_ANALYSIS_PROVIDER;
  if (!(TRANSCRIPTION_NAMES as readonly string[]).includes(transcriptionName)) {
    throw new Error(
      `provider_not_configured: TRANSCRIPTION_PROVIDER "${transcriptionName}" is unknown. Use one of: ${TRANSCRIPTION_NAMES.join(", ")}.`,
    );
  }
  if (!(VIDEO_ANALYSIS_NAMES as readonly string[]).includes(videoName)) {
    throw new Error(
      `provider_not_configured: VIDEO_ANALYSIS_PROVIDER "${videoName}" is unknown. Use one of: ${VIDEO_ANALYSIS_NAMES.join(", ")}.`,
    );
  }
  const usesMock = transcriptionName === "mock" || videoName === "mock";
  if (usesMock && config.SLEUTH_DATA_MODE === "supabase" && !config.ALLOW_MOCK_PROVIDERS) {
    throw new Error(
      "provider_not_configured: the mock providers return the golden fixture whatever the video shows, " +
        "so supabase mode refuses them. Set ALLOW_MOCK_PROVIDERS=1 for local testing only.",
    );
  }
  if (transcriptionName === "deepgram" && !config.TRANSCRIPTION_API_KEY) {
    throw new Error("provider_not_configured: TRANSCRIPTION_API_KEY is not set.");
  }
  if (videoName === "gemini" && !config.VIDEO_ANALYSIS_API_KEY) {
    throw new Error("provider_not_configured: VIDEO_ANALYSIS_API_KEY is not set.");
  }

  const mocks = usesMock ? createFixtureBackedMocks() : null;
  const transcription: TranscriptionProvider =
    transcriptionName === "deepgram"
      ? createDeepgramTranscription({
          apiKey: config.TRANSCRIPTION_API_KEY ?? "",
          ...(config.TRANSCRIPTION_MODEL ? { model: config.TRANSCRIPTION_MODEL } : {}),
          ...(onUsage ? { onUsage } : {}),
        })
      : (mocks as ProviderSet).transcription;
  const videoAnalysis: VideoAnalysisProvider =
    videoName === "gemini"
      ? createGeminiVideoAnalysis({
          apiKey: config.VIDEO_ANALYSIS_API_KEY ?? "",
          model: config.VIDEO_ANALYSIS_MODEL ?? "gemini-3.8-flash",
          ...(config.VIDEO_ANALYSIS_FALLBACK_MODEL
            ? { fallbackModel: config.VIDEO_ANALYSIS_FALLBACK_MODEL }
            : {}),
          maxFrames: config.MAX_FRAMES_PER_VIDEO,
          ...(onUsage ? { onUsage } : {}),
        })
      : (mocks as ProviderSet).videoAnalysis;
  return { transcription, videoAnalysis };
}
