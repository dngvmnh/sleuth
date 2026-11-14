import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export interface CreateDbOptions {
  /** Connection pool size. Default 5. */
  max?: number;
  /**
   * Close a connection after this many idle seconds. Default: never. Serverless instances should
   * set it, so a warm but quiet instance does not hold pooler slots (the Supabase session pooler
   * allows 15 clients in total).
   */
  idleTimeoutSeconds?: number;
}

/**
 * Server and worker only. `url` is a DATABASE_URL; never pass it to the browser.
 * Prepared statements are off: the Supabase pooler does not guarantee them across connections.
 */
export function createDb(url: string, options: CreateDbOptions = {}) {
  const client = postgres(url, {
    max: options.max ?? 5,
    prepare: false,
    ...(options.idleTimeoutSeconds ? { idle_timeout: options.idleTimeoutSeconds } : {}),
  });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
