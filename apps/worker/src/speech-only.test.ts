import { describe, expect, it, vi } from "vitest";
import { SPEECH_ONLY_NOTE } from "@sleuth/evidence-engine";

// Watch the real Gemini factory, so a test can prove `none` never builds a client.
const geminiFactory = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@sleuth/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sleuth/media")>();
  return {
    ...actual,
    createGeminiVideoAnalysis: (...args: Parameters<typeof actual.createGeminiVideoAnalysis>) => {
      geminiFactory.calls += 1;
      return actual.createGeminiVideoAnalysis(...args);
    },
  };
});

import { loadConfig } from "./config";
import { createProviders, geminiFramesAllowed } from "./providers";
import {
  FAKE_KEY,
  fakeMedia,
  fakeStore,
  fx,
  geminiSet,
  handlerOptions,
  inputsFor,
  job,
} from "./speech-only.fakes";
import { createSupabaseHandler } from "./supabase-handler";

const OURS = "11111111-1111-4111-8111-111111111111";
const VISITOR = "22222222-2222-4222-8222-222222222222";
const real = (userId: string) => ({ userId, realAccount: true });

const supabaseBase = {
  SLEUTH_DATA_MODE: "supabase",
  TRANSCRIPTION_PROVIDER: "deepgram",
  TRANSCRIPTION_API_KEY: "deepgram-key-not-real",
  ALLOW_MOCK_PROVIDERS: false,
  MAX_FRAMES_PER_VIDEO: 60,
} as const;

describe("VIDEO_ANALYSIS_PROVIDER=none (decision D-4)", () => {
  it("has no video provider, needs no key and never builds a Gemini client", () => {
    geminiFactory.calls = 0;
    const set = createProviders({ ...supabaseBase, VIDEO_ANALYSIS_PROVIDER: "none" });
    expect(set.videoAnalysis).toBeNull();
    expect(set.sendsFramesFor(real(OURS))).toBe(false);
    expect(geminiFactory.calls).toBe(0);
  });

  it("is not a fallback: unset or mock in supabase mode still stops the worker", () => {
    const fromEnv = loadConfig({ SLEUTH_DATA_MODE: "supabase", DATABASE_URL: "postgres://x" });
    expect(fromEnv.VIDEO_ANALYSIS_PROVIDER).toBe("mock");
    expect(() =>
      createProviders({
        ...supabaseBase,
        VIDEO_ANALYSIS_PROVIDER: fromEnv.VIDEO_ANALYSIS_PROVIDER,
      }),
    ).toThrow(/provider_not_configured/);
  });

  it("reads VIDEO_ANALYSIS_OWNER_IDS as a trimmed lower-case list; empty means nobody", () => {
    expect(loadConfig({}).VIDEO_ANALYSIS_OWNER_IDS).toEqual([]);
    expect(
      loadConfig({ VIDEO_ANALYSIS_OWNER_IDS: ` ${OURS.toUpperCase()} , ,${VISITOR}` })
        .VIDEO_ANALYSIS_OWNER_IDS,
    ).toEqual([OURS, VISITOR]);
  });

  it("finishes a visitor job with a transcript-only result, no frames and the speech-only note", async () => {
    const set = createProviders({ ...supabaseBase, VIDEO_ANALYSIS_PROVIDER: "none" });
    const store = fakeStore(inputsFor({ userId: VISITOR, realAccount: false }));
    const media = fakeMedia();
    const log = vi.fn();
    // The real Deepgram adapter would call the network; the mock transcript stands in for it.
    const providers = { ...set, transcription: geminiSet([]).transcription };
    await createSupabaseHandler({ ...handlerOptions(store, providers, media), log })(job);

    expect(media.frameCalls).toBe(0);
    expect(media.frameDirs).toEqual([]);
    const [written] = store.written;
    expect(written?.frames).toEqual([]);
    expect(written?.transcript?.length).toBe(fx.transcript.length);
    expect(written?.findings.length).toBeGreaterThan(0);
    for (const f of written?.findings ?? [])
      expect(f.limits.startsWith(SPEECH_ONLY_NOTE)).toBe(true);
    for (const e of written?.evidence ?? []) {
      expect(e.explanation).toContain(SPEECH_ONLY_NOTE);
      expect(e.frameObservationIds).toEqual([]);
      // Speech alone never proves a screen claim: only outside-proof lines get a candidate.
      expect(e.status).toBe("needs_outside_proof");
    }
    expect(JSON.stringify(written)).not.toContain('"confirmed"');
    expect(log).toHaveBeenCalledWith(
      "analysed",
      expect.objectContaining({ frames: 0, speechOnly: 1 }),
    );
  });
});

describe("VIDEO_ANALYSIS_PROVIDER=gemini with VIDEO_ANALYSIS_OWNER_IDS", () => {
  const run = async (owner: Parameters<typeof inputsFor>[0], list: string[]) => {
    const set = geminiSet(list);
    const store = fakeStore(inputsFor(owner));
    const media = fakeMedia();
    const logs: unknown[] = [];
    const error = await createSupabaseHandler({
      ...handlerOptions(store, set, media),
      log: (event, fields) => logs.push({ event, fields }),
    })(job).catch((e: unknown) => e);
    return { set, store, media, logs, error };
  };

  it("sends no frame for an owner who is not on the list", async () => {
    const { set, media, store } = await run(real(VISITOR), [OURS]);
    expect(set.client.calls).toBe(0);
    expect(media.frameCalls).toBe(0);
    expect(store.written[0]?.frames).toEqual([]);
  });

  it("calls Gemini for a real team account on the list", async () => {
    const { set, media, store } = await run(real(OURS), [OURS]);
    expect(set.client.calls).toBe(1);
    expect(media.frameCalls).toBe(1);
    expect(store.written[0]?.frames?.length).toBeGreaterThan(0);
    for (const f of store.written[0]?.findings ?? [])
      expect(f.limits).not.toContain(SPEECH_ONLY_NOTE);
  });

  it("sends no frame for an anonymous owner, even one put on the list", async () => {
    for (const owner of [
      { userId: null, realAccount: false },
      { userId: OURS, realAccount: false },
    ]) {
      const { set, media } = await run(owner, [OURS]);
      expect(set.client.calls).toBe(0);
      expect(media.frameCalls).toBe(0);
    }
  });

  it("sends nothing to anyone with an empty list", () => {
    expect(geminiFramesAllowed(real(OURS), [])).toBe(false);
  });

  it("keeps keys, transcript text and URLs out of logs and errors", async () => {
    // The real gemini set, with a planted key. A visitor's job never reaches the network.
    const realSet = createProviders({
      ...supabaseBase,
      TRANSCRIPTION_PROVIDER: "mock",
      ALLOW_MOCK_PROVIDERS: true,
      VIDEO_ANALYSIS_PROVIDER: "gemini",
      VIDEO_ANALYSIS_API_KEY: FAKE_KEY,
      VIDEO_ANALYSIS_OWNER_IDS: [OURS],
    });
    const logs: unknown[] = [];
    const store = fakeStore(inputsFor(real(VISITOR)));
    const error = await createSupabaseHandler({
      ...handlerOptions(store, realSet, fakeMedia()),
      log: (event, fields) => logs.push({ event, fields }),
    })(job).catch((e: unknown) => e);
    expect(error).toBeUndefined();
    expect(store.written[0]?.frames).toEqual([]);

    const listed = await run(real(OURS), [OURS]);
    for (const out of [
      JSON.stringify(logs) + String(error ?? ""),
      JSON.stringify(listed.logs) + String(listed.error ?? ""),
    ]) {
      expect(out).not.toContain(FAKE_KEY);
      expect(out).not.toContain("storage.invalid");
      for (const s of fx.transcript) expect(out).not.toContain(s.text);
    }
  });
});
