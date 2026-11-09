import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { planFrames } from "@sleuth/evidence-engine";
import {
  extractAudio,
  extractFrames,
  probeDurationMs,
  validateObservations,
  validateTranscript,
  withTempDir,
  type ProviderUsage,
} from "@sleuth/media";
import { loadConfig } from "./config";
import { createProviders } from "./providers";
import { describeError } from "./queue";

/**
 * Manual check of the real providers on one short clip (evidence-analysis 10):
 *
 *   pnpm --filter @sleuth/worker smoke -- path/to/clip.mp4
 *
 * Needs TRANSCRIPTION_PROVIDER, VIDEO_ANALYSIS_PROVIDER and their keys in the environment. It
 * prints NUMBERS ONLY: lengths, counts, rejected counts and token usage. No transcript, no frame
 * text, no path, no key. The output can be pasted into a pull request or searched for leaks.
 */

async function main(): Promise<number> {
  const file = process.argv.slice(2).find((a) => a !== "--");
  if (!file) {
    console.error("usage: smoke <video file>");
    return 2;
  }
  const config = loadConfig(process.env);
  if (config.TRANSCRIPTION_PROVIDER === "mock" || config.VIDEO_ANALYSIS_PROVIDER === "mock") {
    console.error("provider_not_configured: smoke needs real providers; both are set to mock.");
    return 2;
  }
  const usage: ProviderUsage[] = [];
  const providers = createProviders(config, (u) => usage.push(u));

  return withTempDir(async (dir) => {
    const durationMs = await probeDurationMs(file);
    if (durationMs > config.MAX_VIDEO_SECONDS * 1000) {
      console.error("probe: duration_exceeded");
      return 2;
    }
    const audioPath = join(dir, "audio.wav");
    await extractAudio(file, audioPath);
    const framesDir = join(dir, "frames");
    await mkdir(framesDir);
    const frames = await extractFrames(
      file,
      planFrames(durationMs, { intervalMs: 2000, maxFrames: config.MAX_FRAMES_PER_VIDEO }),
      framesDir,
    );

    const base = { projectId: "smoke", assetVersionId: "smoke-av", durationMs };
    const started = Date.now();
    const rawTranscript = await providers.transcription.transcribe({ ...base, audioPath });
    const rawObservations = await providers.videoAnalysis.analyse({ ...base, frames });
    const seconds = Math.round((Date.now() - started) / 100) / 10;

    const transcript = validateTranscript(rawTranscript, durationMs);
    const observations = validateObservations(rawObservations, durationMs);
    const sum = (provider: string, field: "inputTokens" | "outputTokens") =>
      usage.filter((u) => u.provider === provider).reduce((n, u) => n + u[field], 0);

    const lines = [
      `providers: ${providers.transcription.name} + ${providers.videoAnalysis.name}`,
      `video_ms: ${durationMs}`,
      `frames_sent: ${frames.length}`,
      `transcript_segments_kept: ${transcript.valid.length}`,
      `transcript_segments_rejected: ${transcript.rejectedCount}`,
      `words: ${transcript.valid.reduce((n, s) => n + s.words.length, 0)}`,
      `observations_kept: ${observations.valid.length}`,
      `observations_rejected: ${observations.rejectedCount}`,
      `observations_with_screen_text: ${observations.valid.filter((o) => o.onScreenText.length > 0).length}`,
      `transcription_audio_seconds_billed: ${sum(providers.transcription.name, "inputTokens")}`,
      `video_analysis_input_tokens: ${sum(providers.videoAnalysis.name, "inputTokens")}`,
      `video_analysis_output_tokens: ${sum(providers.videoAnalysis.name, "outputTokens")}`,
      `provider_seconds: ${seconds}`,
    ];
    console.log(lines.join("\n"));
    return 0;
  });
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`smoke failed: ${describeError(error)}`);
    process.exit(1);
  },
);
