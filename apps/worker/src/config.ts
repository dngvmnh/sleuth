import { z } from "zod";

const EnvSchema = z.object({
  SLEUTH_DATA_MODE: z.enum(["fixture", "supabase"]).default("fixture"),
  DATABASE_URL: z.string().optional(),
  MAX_VIDEO_SECONDS: z.coerce.number().int().positive().default(180),
  MAX_FRAMES_PER_VIDEO: z.coerce.number().int().positive().default(60),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_HEARTBEAT_MS: z.coerce.number().int().positive().default(10000),
  WORKER_STALE_SECONDS: z.coerce.number().int().positive().default(60),
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
