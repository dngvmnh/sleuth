import { z } from "zod";

const EnvSchema = z.object({
  SLEUTH_DATA_MODE: z.enum(["fixture", "supabase"]).default("fixture"),
  DATABASE_URL: z.string().optional(),
  MAX_VIDEO_SECONDS: z.coerce.number().int().positive().default(180),
  MAX_FRAMES_PER_VIDEO: z.coerce.number().int().positive().default(60),
  /** Largest video the worker downloads. Matches the storage bucket limit (50 MiB). */
  MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(52_428_800),
  /** `mock` until a real adapter is chosen (ADR 0007) and built (evidence-analysis 10). */
  TRANSCRIPTION_PROVIDER: z.string().default("mock"),
  /**
   * `none` is speech-only: no frame is cut or sent anywhere, and no video-analysis key is read.
   * The default stays `mock`, which supabase mode refuses, so a missing setting stops the worker
   * instead of falling back to a provider that sends frames (decision D-4).
   */
  VIDEO_ANALYSIS_PROVIDER: z.string().default("mock"),
  /**
   * With `VIDEO_ANALYSIS_PROVIDER=gemini`: the only project owners whose frames may go to Gemini,
   * comma separated user ids. Our own team accounts only, never a visitor. Empty means nobody, so
   * every job is speech-only. An anonymous or unknown owner is speech-only even when listed.
   */
  VIDEO_ANALYSIS_OWNER_IDS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s !== ""),
    ),
  /** Secrets. Held by the worker only; never logged, never put in an error. */
  TRANSCRIPTION_API_KEY: z.string().optional(),
  VIDEO_ANALYSIS_API_KEY: z.string().optional(),
  /** Model ids (ADR 0007). Models change often, so they are config, not code. */
  TRANSCRIPTION_MODEL: z.string().default("nova-3"),
  VIDEO_ANALYSIS_MODEL: z.string().default("gemini-3.8-flash"),
  /**
   * Used for the rest of a job when the model above still fails after its retries (server error,
   * timeout, no answer). On 10 November `gemini-3.8-flash` failed 3 of 3 tries on the free tier and
   * `gemini-3.6-flash` worked 3 of 4 (D-4). Set it to the same id as the model to turn it off.
   */
  VIDEO_ANALYSIS_FALLBACK_MODEL: z.string().default("gemini-3.6-flash"),
  /**
   * The mock providers return the golden fixture, whatever the video says. In supabase mode that
   * would show invented results as an analysis, so the worker refuses to start with them unless
   * this is set. For local testing only.
   */
  ALLOW_MOCK_PROVIDERS: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_HEARTBEAT_MS: z.coerce.number().int().positive().default(10000),
  WORKER_STALE_SECONDS: z.coerce.number().int().positive().default(60),
  /** Anonymous-project purge (ADR 0008): how often, and after how many days. */
  RETENTION_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  ANONYMOUS_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
});

export type WorkerConfig = z.infer<typeof EnvSchema>;

/** Blank values count as unset, so `.env` files copied from `.env.example` work. */
export function loadConfig(env: Record<string, string | undefined>): WorkerConfig {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const config = EnvSchema.parse(cleaned);
  if (config.SLEUTH_DATA_MODE === "supabase" && !config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when SLEUTH_DATA_MODE=supabase.");
  }
  return config;
}
