/**
 * Keep-alive ping for the free sleuth-prod project (`.github/workflows/keep-alive.yml`).
 * One cheap read-only query through the same driver and options as the worker: `createDb` from
 * `@sleuth/db` (postgres.js, `prepare: false`), one connection, and a 20-second limit.
 *
 * Prints `ok`, or `error <category>` with category auth, host, timeout, tls, config or other.
 * The category comes from the error's name or code only, never from its message, so no URL,
 * host, user name or server text can reach the output.
 *
 *   $env:DATABASE_URL = Read-Host "Session pooler URL"; pnpm tsx scripts/keep-alive.ts
 */
import { createDb } from "@sleuth/db";

const TIMEOUT_MS = 20_000;

type Category = "auth" | "host" | "timeout" | "tls" | "config" | "other";

/** Map an error to a category from its `code` or `name` only. */
export function categoryOf(error: unknown): Category {
  const e = (error ?? {}) as { code?: unknown; name?: unknown; cause?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const name = typeof e.name === "string" ? e.name : "";
  if (code === "KEEP_ALIVE_TIMEOUT" || code === "CONNECT_TIMEOUT" || code === "ETIMEDOUT")
    return "timeout";
  // 28P01 invalid password, 28000 invalid authorization, and the SASL step of postgres.js.
  if (code === "28P01" || code === "28000" || code.startsWith("SASL")) return "auth";
  if (
    [
      "ENOTFOUND",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ECONNRESET",
    ].includes(code)
  )
    return "host";
  if (
    code.startsWith("ERR_TLS") ||
    code.startsWith("ERR_SSL") ||
    code.includes("CERT") ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  )
    return "tls";
  if (code === "ERR_INVALID_URL" || name === "TypeError") return "config";
  // postgres.js wraps some socket errors; look one level down, still by code only.
  if (e.cause && e.cause !== error) {
    const inner = categoryOf(e.cause);
    if (inner !== "other") return inner;
  }
  return "other";
}

async function main(): Promise<string> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return "error config";
  let handle: ReturnType<typeof createDb> | null = null;
  try {
    handle = createDb(url, { max: 1 });
    const client = handle.client;
    const timer = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error("timeout"), { code: "KEEP_ALIVE_TIMEOUT" })),
        TIMEOUT_MS,
      ).unref(),
    );
    await Promise.race([client`select count(*) from projects where is_demo`, timer]);
    return "ok";
  } catch (error) {
    return `error ${categoryOf(error)}`;
  } finally {
    await handle?.client.end({ timeout: 2 }).catch(() => undefined);
  }
}

// Run only as a script, so a test can import `categoryOf` without connecting.
if (process.argv[1] && /keep-alive\.ts$/.test(process.argv[1])) {
  void main().then((line) => {
    console.log(line);
    process.exit(line === "ok" ? 0 : 1);
  });
}
