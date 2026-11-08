import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "..", "..");

// The team keeps one `.env.local` at the repo root (db scripts and tests read it too). Next only
// looks in apps/web, so load the root file here. Values already in the environment win.
const rootEnv = path.join(repoRoot, ".env.local");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@sleuth/contracts", "@sleuth/domain", "@sleuth/db"],
  // The fixture lives outside apps/web, so tracing and bundling start at the repo root.
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  poweredByHeader: false,
};

export default config;
