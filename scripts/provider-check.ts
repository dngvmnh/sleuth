/**
 * Manual provider check (evidence-analysis 10). Runs one short clip through the real Deepgram and
 * Gemini adapters and prints counts only. It never prints a key, a transcript, a frame or a path.
 *
 * Keys come from the TRANSCRIPTION_API_KEY and VIDEO_ANALYSIS_API_KEY settings in `.env.local`,
 * which this script loads itself. Usage:
 *   pnpm tsx scripts/provider-check.ts <clip.mp4> [--no-video-analysis]
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  MediaError,
  ProviderError,
  createDeepgramTranscription,
  createGeminiVideoAnalysis,
  extractAudio,
  extractFrames,
  probeDurationMs,
  withTempDir,
} from "../packages/media/src/index";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const clip = process.argv[2];
const skipVideo = process.argv.includes("--no-video-analysis");
// The decided model first (D-4), then the fallback. The model in the settings is not used here.
const MODELS = ["gemini-3.8-flash", "gemini-3.6-flash"];
const MAX_SECONDS = 30;

const secrets = [process.env.TRANSCRIPTION_API_KEY, process.env.VIDEO_ANALYSIS_API_KEY].filter(
  (v): v is string => typeof v === "string" && v.length > 0,
);
const lines: string[] = [];
const say = (line: string): void => {
  lines.push(line);
  console.log(line);
};
const fail = (what: string, error: unknown): void => {
  const code =
    error instanceof ProviderError || error instanceof MediaError
      ? error.message
      : "unexpected_error";
  say(`${what}: failed (${code})`);
};

async function main(): Promise<void> {
  if (!clip || !existsSync(clip)) {
    say("usage: provider-check.ts <clip.mp4>; clip not found");
    process.exitCode = 1;
    return;
  }
  const durationMs = await probeDurationMs(clip);
  if (durationMs > MAX_SECONDS * 1000) {
    say(`clip is ${Math.round(durationMs / 1000)} s; the limit for this check is ${MAX_SECONDS} s`);
    process.exitCode = 1;
    return;
  }
  say(`clip: ${Math.round(durationMs / 1000)} s`);

  await withTempDir(async (dir) => {
    const audio = join(dir, "audio.wav");
    await extractAudio(clip, audio);

    try {
      const transcribe = createDeepgramTranscription({
        apiKey: process.env.TRANSCRIPTION_API_KEY ?? "",
        ...(process.env.TRANSCRIPTION_MODEL ? { model: process.env.TRANSCRIPTION_MODEL } : {}),
      });
      const segments = await transcribe.transcribe({
        projectId: "check",
        assetVersionId: "check-v1",
        durationMs,
        audioPath: audio,
      });
      const words = segments.reduce((n, s) => n + s.words.length, 0);
      say(`deepgram: ok, ${segments.length} segments, ${words} words`);
    } catch (error) {
      fail("deepgram", error);
      process.exitCode = 1;
    }

    if (skipVideo) return;
    const stamps = [1000, Math.floor(durationMs / 2), Math.max(0, durationMs - 1500)];
    const frames = await extractFrames(clip, stamps, dir);
    for (const model of MODELS) {
      try {
        const analyse = createGeminiVideoAnalysis({
          apiKey: process.env.VIDEO_ANALYSIS_API_KEY ?? "",
          model,
          // A check should answer fast: one try, 110 s.
          maxAttempts: 1,
          timeoutMs: 110_000,
        });
        const out = await analyse.analyse({
          projectId: "check",
          assetVersionId: "check-v1",
          durationMs,
          frames,
        });
        const texts = out.reduce((n, o) => n + o.onScreenText.length, 0);
        say(
          `gemini ${model}: ok, ${frames.length} frames sent, ${out.length} observations, ${texts} text items`,
        );
        return;
      } catch (error) {
        fail(`gemini ${model}`, error);
      }
    }
    process.exitCode = 1;
  }, "sleuth-check-");

  // Leak check: no key value may appear in what this script printed.
  const leaked = secrets.some((s) => lines.some((l) => l.includes(s)));
  say(
    leaked
      ? "leak check: FAILED, a key appeared in the output"
      : "leak check: ok, no key in the output",
  );
  if (leaked) process.exitCode = 1;
}

main().catch((error: unknown) => {
  fail("run", error);
  process.exitCode = 1;
});
