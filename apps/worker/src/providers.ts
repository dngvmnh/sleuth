import type { JobOwner } from "@sleuth/db";
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
  /** Null with `VIDEO_ANALYSIS_PROVIDER=none`: speech only, and no video-analysis client exists. */
  videoAnalysis: VideoAnalysisProvider | null;
  /**
   * Whether this job's frames may be cut and sent to `videoAnalysis` (decision D-4). False means
   * the job runs speech only. Asked once per job, from the project's owner.
   */
  sendsFramesFor(owner: JobOwner): boolean;
}

/**
 * The mock providers of supabase mode: the golden fixture's transcript and frames, stamped with
 * the job's project and video version and given ids that are unique to that video, so a retry
 * writes the same rows. They ignore the audio and the pictures. For local testing only.
 */
function createFixtureBackedMocks(): Pick<ProviderSet, "transcription"> & {
  videoAnalysis: VideoAnalysisProvider;
} {
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
      | "VIDEO_ANALYSIS_OWNER_IDS"
    >
  >;

const TRANSCRIPTION_NAMES = ["mock", "deepgram"] as const;
const VIDEO_ANALYSIS_NAMES = ["mock", "gemini", "none"] as const;

/**
 * The rule for `gemini`: frames go out only for a project owned by a real (not anonymous) account
 * on the team's list. Everyone else, every visitor included, is speech only.
 */
export function geminiFramesAllowed(owner: JobOwner, ownerIds: readonly string[]): boolean {
  if (owner.userId === null || !owner.realAccount) return false;
  return ownerIds.includes(owner.userId.toLowerCase());
}

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
  // `none` never reads the video-analysis key, so it cannot be refused for a missing one.
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
      : (mocks as NonNullable<typeof mocks>).transcription;

  if (videoName === "none") {
    return { transcription, videoAnalysis: null, sendsFramesFor: () => false };
  }
  if (videoName === "gemini") {
    const ownerIds = config.VIDEO_ANALYSIS_OWNER_IDS ?? [];
    return {
      transcription,
      videoAnalysis: createGeminiVideoAnalysis({
        apiKey: config.VIDEO_ANALYSIS_API_KEY ?? "",
        model: config.VIDEO_ANALYSIS_MODEL ?? "gemini-3.8-flash",
        ...(config.VIDEO_ANALYSIS_FALLBACK_MODEL
          ? { fallbackModel: config.VIDEO_ANALYSIS_FALLBACK_MODEL }
          : {}),
        maxFrames: config.MAX_FRAMES_PER_VIDEO,
        ...(onUsage ? { onUsage } : {}),
      }),
      sendsFramesFor: (owner) => geminiFramesAllowed(owner, ownerIds),
    };
  }
  // The mock reads nothing and sends nothing anywhere, so every owner may use it.
  return {
    transcription,
    videoAnalysis: (mocks as NonNullable<typeof mocks>).videoAnalysis,
    sendsFramesFor: () => true,
  };
}
