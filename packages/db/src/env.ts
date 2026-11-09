import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Load `.env.local` from the repo root into `process.env` when it exists. Values already set in
 * the environment win. Used by scripts and tests; never prints a value. Server and test use only.
 */
export function loadLocalEnv(): void {
  const file = fileURLToPath(new URL("../../../.env.local", import.meta.url));
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch {
    // An unreadable env file means "not configured"; callers check the variables they need.
  }
}
