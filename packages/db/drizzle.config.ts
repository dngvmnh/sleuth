import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` reads only the schema file; it needs no database connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  entities: { roles: { provider: "supabase" } },
});
