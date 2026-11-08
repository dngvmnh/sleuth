import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Server and worker only. `url` is a DATABASE_URL; never pass it to the browser. */
export function createDb(url: string) {
  const client = postgres(url, { max: 5 });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
