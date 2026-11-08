import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";
import { loadLocalEnv } from "./env";

/**
 * Apply the SQL files in `packages/db/migrations` to DATABASE_URL, recorded in
 * drizzle.__drizzle_migrations. This is the only way migrations are applied; do not paste SQL.
 */
async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local.");
    process.exit(1);
  }
  const { db, client } = createDb(url, { max: 1 });
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
    });
    console.log("Migrations are up to date.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "migration failed");
  process.exit(1);
});
