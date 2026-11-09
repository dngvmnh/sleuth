import { ProviderError, type CallBudget, type ProviderErrorCode } from "./errors";

export interface PostOptions {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: string | Uint8Array;
  budget: CallBudget;
  fetchFn?: typeof fetch;
  /** Give up on one attempt after this long. */
  timeoutMs?: number;
  /** Attempts in total, the first included. */
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Status codes that will not get better by asking again. */
function permanentCode(status: number): ProviderErrorCode | null {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 402) return "auth_failed";
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "request_rejected";
  return null;
}

/**
 * POSTs once, and again after a pause when the answer was a timeout, a network failure, 429 or a
 * server error. Every attempt takes one call from the budget. Errors carry a code and nothing the
 * provider said, so a key, a URL or a transcript can never end up in a log or a job row.
 */
export async function postJson(options: PostOptions): Promise<unknown> {
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? 3;
  let last: ProviderErrorCode = "unreachable";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    options.budget.take();
    try {
      const response = await fetchFn(options.url, {
        method: "POST",
        headers: options.headers,
        body: options.body as RequestInit["body"],
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
      });
      if (response.ok) {
        try {
          return (await response.json()) as unknown;
        } catch {
          throw new ProviderError(options.provider, "bad_response");
        }
      }
      const permanent = permanentCode(response.status);
      if (permanent) throw new ProviderError(options.provider, permanent);
      last = response.status === 429 ? "rate_limited" : "server_error";
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      last = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "unreachable";
    }
    if (attempt < maxAttempts) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
  }
  throw new ProviderError(options.provider, last);
}
