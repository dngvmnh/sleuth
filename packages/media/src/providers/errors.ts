export type ProviderErrorCode =
  | "provider_not_configured"
  | "input_missing"
  | "audio_unreadable"
  | "auth_failed"
  | "request_rejected"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "unreachable"
  | "bad_response"
  | "empty_response"
  | "budget_exceeded";

/**
 * A failed provider call. The message is `provider: code`. It never holds the key, the audio, a
 * frame, a transcript, a URL, or anything the provider sent back, so it is safe to store on a job.
 */
export class ProviderError extends Error {
  readonly provider: string;
  readonly code: ProviderErrorCode;

  constructor(provider: string, code: ProviderErrorCode) {
    super(`${provider}: ${code}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.code = code;
  }
}

/** Counts calls (retries included) for one job and refuses the call after the last one allowed. */
export interface CallBudget {
  take(): void;
  readonly used: () => number;
}

export function createCallBudget(provider: string, maxCalls: number): CallBudget {
  let used = 0;
  return {
    take() {
      if (used >= maxCalls) throw new ProviderError(provider, "budget_exceeded");
      used += 1;
    },
    used: () => used,
  };
}

/** Token counts a provider reported. Numbers only, so they can be printed and logged. */
export interface ProviderUsage {
  provider: string;
  inputTokens: number;
  outputTokens: number;
}
