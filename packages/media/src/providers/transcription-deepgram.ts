import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { TranscriptSegment } from "@sleuth/contracts";
import type { TranscribeInput, TranscriptionProvider } from "../providers";
import { ProviderError, createCallBudget, type ProviderUsage } from "./errors";
import { postJson } from "./http";

const PROVIDER = "deepgram";

export interface DeepgramOptions {
  apiKey: string;
  /** Deepgram model id. Read from config so a new model needs no code change. */
  model?: string;
  baseUrl?: string;
  /** Calls allowed per job, retries included. */
  maxCalls?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  readAudio?: (path: string) => Promise<Uint8Array>;
  onUsage?: (usage: ProviderUsage) => void;
}

const WordSchema = z.object({
  word: z.string(),
  punctuated_word: z.string().optional(),
  start: z.number(),
  end: z.number(),
});
const ResponseSchema = z.object({
  results: z.object({
    utterances: z
      .array(
        z.object({
          start: z.number(),
          end: z.number(),
          transcript: z.string(),
          words: z.array(WordSchema).default([]),
        }),
      )
      .default([]),
  }),
  metadata: z.object({ duration: z.number().optional() }).optional(),
});

const toMs = (seconds: number): number => Math.max(0, Math.round(seconds * 1000));

/**
 * Speech to text with Deepgram's pre-recorded API (ADR 0007). Every request carries
 * `mip_opt_out=true`, so Deepgram does not keep the audio for model training. The audio file is read
 * from `input.audioPath`; the key goes in a header only.
 *
 * Output is untrusted: the pipeline validates it again with `validateTranscript`.
 */
export function createDeepgramTranscription(options: DeepgramOptions): TranscriptionProvider {
  const baseUrl = options.baseUrl ?? "https://api.deepgram.com";
  const model = options.model ?? "nova-3";
  const readAudio = options.readAudio ?? ((path: string) => readFile(path));

  return {
    name: PROVIDER,
    async transcribe(input: TranscribeInput): Promise<TranscriptSegment[]> {
      if (!options.apiKey) throw new ProviderError(PROVIDER, "provider_not_configured");
      if (!input.audioPath) throw new ProviderError(PROVIDER, "input_missing");
      let audio: Uint8Array;
      try {
        audio = await readAudio(input.audioPath);
      } catch {
        throw new ProviderError(PROVIDER, "audio_unreadable");
      }

      const query = new URLSearchParams({
        model,
        language: "en",
        utterances: "true",
        punctuate: "true",
        smart_format: "true",
        mip_opt_out: "true",
      });
      const json = await postJson({
        provider: PROVIDER,
        url: `${baseUrl}/v1/listen?${query.toString()}`,
        headers: { Authorization: `Token ${options.apiKey}`, "Content-Type": "audio/wav" },
        body: audio,
        budget: createCallBudget(PROVIDER, options.maxCalls ?? 3),
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
        ...(options.sleep ? { sleep: options.sleep } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
        ...(options.maxAttempts ? { maxAttempts: options.maxAttempts } : {}),
      });

      const parsed = ResponseSchema.safeParse(json);
      if (!parsed.success) throw new ProviderError(PROVIDER, "bad_response");
      if (parsed.data.metadata?.duration !== undefined) {
        // Deepgram bills by audio duration, so the useful count is seconds, reported as input.
        options.onUsage?.({
          provider: PROVIDER,
          inputTokens: Math.round(parsed.data.metadata.duration),
          outputTokens: 0,
        });
      }

      const segments: TranscriptSegment[] = [];
      for (const utterance of parsed.data.results.utterances) {
        const text = utterance.transcript.trim();
        if (text.length === 0) continue;
        const startMs = toMs(utterance.start);
        const endMs = Math.max(startMs, toMs(utterance.end));
        const words = utterance.words
          .map((w) => {
            const wordStart = toMs(w.start);
            return {
              text: (w.punctuated_word ?? w.word).trim(),
              startMs: wordStart,
              endMs: Math.max(wordStart, toMs(w.end)),
            };
          })
          .filter((w) => w.text.length > 0);
        segments.push({
          id: `${input.assetVersionId}-tr-${segments.length + 1}`,
          projectId: input.projectId,
          assetVersionId: input.assetVersionId,
          startMs,
          endMs,
          text,
          words,
        });
      }
      return segments;
    },
  };
}
