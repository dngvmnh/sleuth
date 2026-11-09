import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { JobFailure } from "./queue";

export interface DownloadOptions {
  /** Give up after this long. Default 120 000 ms. */
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Saves the video behind a short-lived signed URL to `destPath`, never writing more than
 * `maxBytes`. Failures are `download: <code>` with no URL, status text or file content: the URL is
 * a credential for the video and must not reach a log or a job row.
 */
export async function downloadVideo(
  url: string,
  destPath: string,
  maxBytes: number,
  options: DownloadOptions = {},
): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new JobFailure("download", timedOut ? "timeout" : "unreachable");
  }
  if (!response.ok || !response.body) throw new JobFailure("download", "http_error");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new JobFailure("download", "too_large");

  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) callback(new JobFailure("download", "too_large"));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      limit,
      createWriteStream(destPath),
    );
  } catch (error) {
    if (error instanceof JobFailure) throw error;
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new JobFailure("download", timedOut ? "timeout" : "interrupted");
  }
}
