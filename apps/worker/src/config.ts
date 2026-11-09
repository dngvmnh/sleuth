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
  VIDEO_ANALYSIS_PROVIDER: z.string().default("mock"),
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
