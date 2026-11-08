import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDb } from "./client";
import { loadGoldenFixture } from "./fixture/load";
import { fixtureToRows } from "./seed-rows";
import * as t from "./schema";

// Load .env.local or .env if DATABASE_URL is not already in process.env
if (!process.env.DATABASE_URL) {
  for (const rel of [".env.local", ".env", "../../.env.local", "../../.env"]) {
    const p = resolve(process.cwd(), rel);
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
        if (process.env.DATABASE_URL) break;
      } catch {
        // ignore load errors
      }
    }
  }
}

/** Loads the golden fixture into Postgres. Safe to run twice (existing rows are kept). */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Seeding needs supabase mode; fixture mode needs no database.",
    );
    process.exit(1);
  }
  const { db, client } = createDb(url);
  const rows = fixtureToRows(loadGoldenFixture());
  await db.transaction(async (tx) => {
    await tx.insert(t.projects).values(rows.projects).onConflictDoNothing();
    await tx.insert(t.assetVersions).values(rows.assetVersions).onConflictDoNothing();
    await tx.insert(t.scriptVersions).values(rows.scriptVersions).onConflictDoNothing();
    await tx.insert(t.scriptSegments).values(rows.scriptSegments).onConflictDoNothing();
    await tx.insert(t.checklistItems).values(rows.checklistItems).onConflictDoNothing();
    await tx.insert(t.transcriptSegments).values(rows.transcriptSegments).onConflictDoNothing();
    await tx.insert(t.frameObservations).values(rows.frameObservations).onConflictDoNothing();
    await tx.insert(t.evidenceCandidates).values(rows.evidenceCandidates).onConflictDoNothing();
    await tx.insert(t.findings).values(rows.findings).onConflictDoNothing();
    await tx.insert(t.processingJobs).values(rows.processingJobs).onConflictDoNothing();
  });
  await client.end();
  console.log(
    `Seeded demo project with ${rows.evidenceCandidates.length} evidence rows and ${rows.findings.length} findings.`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "seed failed");
  process.exit(1);
});
