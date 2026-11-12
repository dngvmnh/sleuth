import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { formatReport, scoreClip, summarise, type ProducedAnalysis } from "./report";
import { providersFromEnv } from "./real";
import { analyseWithMock, evaluate, loadClip, main } from "./run";
import { LabelledFindingSchema, LabelsSchema, type Labels } from "./schema";

const CLIPS = fileURLToPath(new URL("clips", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "sleuth-eval-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const labels = (over: Partial<Labels> = {}): Labels => ({
  clip: "t",
  labelledBy: "someone",
  labelledOn: "2026-11-09",
  findings: [],
  unscripted: [],
  reordered: [],
  ...over,
});
const produced = (over: Partial<ProducedAnalysis> = {}): ProducedAnalysis => ({
  findings: [],
  unscripted: [],
  reordered: [],
  ...over,
});

describe("the example clip", () => {
  it("is found exactly as its labels say, which proves the plumbing", async () => {
    const loaded = loadClip(join(CLIPS, "example"));
    expect(loaded.labels).not.toBeNull();
    expect(loaded.mock).not.toBeNull();
    const out = await analyseWithMock(loaded.clip, loaded.mock!);
    const score = scoreClip("example", loaded.labels!, out);
    expect(score.disagreements).toEqual([]);
  });

  it("shows a deliberately wrong label as a disagreement", async () => {
    const loaded = loadClip(join(CLIPS, "example"));
    const out = await analyseWithMock(loaded.clip, loaded.mock!);
    const wrong: Labels = {
      ...loaded.labels!,
      findings: [...loaded.labels!.findings, { type: "phantom_dialogue", scriptLine: 1 }],
    };
    const score = scoreClip("example", wrong, out);
    expect(score.disagreements).toEqual([
      { clip: "example", row: "phantom_dialogue", kind: "missed", target: "script line 1" },
    ]);
    expect(summarise([score]).phantom_dialogue.recall).toBe(0.5);
  });
});

describe("scoreClip", () => {
  it("counts a finding as right only when type and target both match", () => {
    const score = scoreClip(
      "t",
      labels({ findings: [{ type: "ghost", checklistItem: 2 }] }),
      produced({ findings: [{ type: "ghost", checklistItem: 3 }] }),
    );
    expect(score.counts.ghost).toEqual({ right: 0, extra: 1, missed: 1 });
    expect(score.disagreements.map((d) => [d.kind, d.target])).toEqual([
      ["missed", "checklist item 2"],
      ["extra", "checklist item 3"],
    ]);
  });

  it("computes precision and recall from the counts", () => {
    const score = scoreClip(
      "t",
      labels({
        findings: [
          { type: "cursed_frame", scriptLine: 1 },
          { type: "cursed_frame", scriptLine: 2 },
        ],
      }),
      produced({
        findings: [
          { type: "cursed_frame", scriptLine: 1 },
          { type: "cursed_frame", scriptLine: 3 },
          { type: "cursed_frame", scriptLine: 4 },
        ],
      }),
    );
    const row = summarise([score]).cursed_frame;
    expect(row).toMatchObject({ right: 1, extra: 2, missed: 1 });
    expect(row.precision).toBeCloseTo(1 / 3);
    expect(row.recall).toBeCloseTo(1 / 2);
  });

  it("reports precision and recall as unknown, not zero, when there is nothing to divide by", () => {
    const row = summarise([scoreClip("t", labels(), produced())]).ghost;
    expect(row.precision).toBeNull();
    expect(row.recall).toBeNull();
  });

  it("matches an unscripted sentence to a leftover spoken segment close in time, once", () => {
    const near = scoreClip(
      "t",
      labels({ unscripted: [{ atMs: 10_000 }] }),
      produced({ unscripted: [{ startMs: 11_000, endMs: 12_000 }] }),
    );
    expect(near.counts.unscripted).toEqual({ right: 1, extra: 0, missed: 0 });

    const far = scoreClip(
      "t",
      labels({ unscripted: [{ atMs: 10_000 }] }),
      produced({ unscripted: [{ startMs: 20_000, endMs: 21_000 }] }),
    );
    expect(far.counts.unscripted).toEqual({ right: 0, extra: 1, missed: 1 });

    const twoLabels = scoreClip(
      "t",
      labels({ unscripted: [{ atMs: 10_000 }, { atMs: 10_500 }] }),
      produced({ unscripted: [{ startMs: 10_000, endMs: 11_000 }] }),
    );
    expect(twoLabels.counts.unscripted).toEqual({ right: 1, extra: 0, missed: 1 });
  });

  it("compares reordered lines as sets", () => {
    const score = scoreClip("t", labels({ reordered: [2, 3] }), produced({ reordered: [3, 4] }));
    expect(score.counts.reordered).toEqual({ right: 1, extra: 1, missed: 1 });
  });
});

describe("formatReport", () => {
  it("names the providers and the clip count, and shows each label beside its plain-English label", () => {
    const text = formatReport({
      providers: "mock",
      clipsRun: ["example"],
      skipped: [{ clip: "clip-5", reason: "not recorded yet (durationMs is empty)" }],
      scores: [scoreClip("example", labels(), produced())],
    });
    expect(text).toContain("providers: mock | clips run: 1");
    expect(text).toContain("Ghost (No visual evidence)");
    expect(text).toContain("Phantom Dialogue (Script line not spoken)");
    expect(text).toContain("Cursed Frame (Needs human check)");
    expect(text).toContain("Needs Outside Proof (Footage cannot prove this)");
    expect(text).toContain("Skipped clip-5");
    expect(text).toMatch(/say nothing about speech or vision quality/);
  });

  it("lists every disagreement", () => {
    const text = formatReport({
      providers: "mock",
      clipsRun: ["t"],
      skipped: [],
      scores: [
        scoreClip("t", labels({ findings: [{ type: "ghost", checklistItem: 1 }] }), produced()),
      ],
    });
    expect(text).toContain("Disagreements: 1");
    expect(text).toContain("labelled but not found at checklist item 1");
  });
});

describe("the label format", () => {
  it("needs a checklist item on a ghost and a script line on every other type", () => {
    expect(LabelledFindingSchema.safeParse({ type: "ghost", scriptLine: 1 }).success).toBe(false);
    expect(LabelledFindingSchema.safeParse({ type: "ghost", checklistItem: 1 }).success).toBe(true);
    expect(
      LabelledFindingSchema.safeParse({ type: "phantom_dialogue", checklistItem: 1 }).success,
    ).toBe(false);
    expect(
      LabelledFindingSchema.safeParse({ type: "phantom_dialogue", scriptLine: 1 }).success,
    ).toBe(true);
  });

  it("counts lines from 1", () => {
    expect(LabelledFindingSchema.safeParse({ type: "cursed_frame", scriptLine: 0 }).success).toBe(
      false,
    );
  });

  it("fills in empty lists for unscripted and reordered", () => {
    const parsed = LabelsSchema.parse({
      clip: "t",
      labelledBy: "someone",
      labelledOn: "2026-11-09",
      findings: [],
    });
    expect(parsed.unscripted).toEqual([]);
    expect(parsed.reordered).toEqual([]);
  });
});

describe("evaluate", () => {
  function clipDir(name: string, files: Record<string, unknown>): string {
    const dir = join(scratch, name);
    mkdirSync(dir, { recursive: true });
    for (const [file, content] of Object.entries(files))
      writeFileSync(join(dir, file), JSON.stringify(content));
    return scratch;
  }
  const clip = {
    name: "x",
    durationMs: 10_000,
    labelledBy: "p",
    script: ["Click Save."],
    checklist: [],
  };

  it("skips a clip that is not recorded, has no labels, or has no mock inputs, and says why", async () => {
    const root = join(scratch, "skip");
    mkdirSync(root);
    for (const [name, files] of Object.entries({
      unrecorded: { "clip.json": { ...clip, durationMs: null } },
      unlabelled: { "clip.json": clip, "mock-inputs.json": { transcript: [], observations: [] } },
      nomock: {
        "clip.json": clip,
        "labels.json": { clip: "x", labelledBy: "p", labelledOn: "2026-11-09", findings: [] },
      },
    })) {
      mkdirSync(join(root, name));
      for (const [file, content] of Object.entries(files))
        writeFileSync(join(root, name, file), JSON.stringify(content));
    }
    const result = await evaluate(root);
    expect(result.clipsRun).toEqual([]);
    expect(result.skipped.map((s) => [s.clip, s.reason])).toEqual([
      ["nomock", "no mock-inputs.json (needed for --providers mock)"],
      ["unlabelled", "no labels.json"],
      ["unrecorded", "not recorded yet (durationMs is empty)"],
    ]);
  });

  it("names the file when a clip does not match the format", async () => {
    const root = clipDir("broken", { "clip.json": { name: "broken", script: [] } });
    expect(() => loadClip(join(root, "broken"))).toThrow(/clip\.json/);
  });

  it("runs the clips in the repository without error", async () => {
    const result = await evaluate(CLIPS);
    expect(result.clipsRun).toContain("example");
  });
});

describe("pnpm eval", () => {
  it("refuses real providers without keys and names the missing setting, not a value", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await main(["--providers", "real"], {})).toBe(2);
    expect(String(error.mock.calls[0]?.[0])).toBe(
      "provider_not_configured: TRANSCRIPTION_API_KEY is not set.",
    );
    expect(await main(["--providers", "real"], { TRANSCRIPTION_API_KEY: "k-do-not-print" })).toBe(
      2,
    );
    expect(String(error.mock.calls[1]?.[0])).toBe(
      "provider_not_configured: VIDEO_ANALYSIS_API_KEY is not set.",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("k-do-not-print");
    expect(await main(["--providers", "other"], {})).toBe(2);
    error.mockRestore();
  });
});

describe("--providers real", () => {
  const example = loadClip(join(CLIPS, "example"));
  const mock = example.mock;
  if (!mock) throw new Error("the example clip needs mock-inputs.json");

  /** Answers like a provider would, from the example's hand-written inputs. */
  const fakeProviders = (seen: { audio?: string; frames?: number; paths?: boolean }) => ({
    label: "fake-transcription + fake-vision",
    transcription: {
      name: "fake",
      transcribe: (input: { projectId: string; assetVersionId: string; audioPath?: string }) => {
        seen.audio = input.audioPath;
        return Promise.resolve(
          mock.transcript.map((t, i) => ({
            id: `t${i + 1}`,
            projectId: input.projectId,
            assetVersionId: input.assetVersionId,
            startMs: t.startMs,
            endMs: t.endMs,
            text: t.text,
            words: [],
          })),
        );
      },
    },
    videoAnalysis: {
      name: "fake",
      analyse: (input: {
        projectId: string;
        assetVersionId: string;
        frames: { timestampMs: number; path?: string }[];
      }) => {
        seen.frames = input.frames.length;
        seen.paths = input.frames.every((f) => typeof f.path === "string");
        return Promise.resolve(
          mock.observations.map((o, i) => ({
            id: `f${i + 1}`,
            projectId: input.projectId,
            assetVersionId: input.assetVersionId,
            ...o,
          })),
        );
      },
    },
  });

  const fakeMedia = (durationMs: number) => ({
    probeDurationMs: () => Promise.resolve(durationMs),
    extractAudio: () => Promise.resolve(),
    extractFrames: (_: string, timestamps: readonly number[], outDir: string) =>
      Promise.resolve(timestamps.map((t) => ({ timestampMs: t, path: join(outDir, `${t}.jpg`) }))),
  });

  const realClipDir = (name: string, withVideo: boolean) => {
    const root = join(scratch, name);
    mkdirSync(join(root, "example"), { recursive: true });
    writeFileSync(join(root, "example", "clip.json"), JSON.stringify(example.clip));
    writeFileSync(join(root, "example", "labels.json"), JSON.stringify(example.labels));
    if (withVideo) writeFileSync(join(root, "example", "example.mp4"), "");
    return root;
  };

  it("scores the same as the mock run when the providers hear and see the same things", async () => {
    const seen: { audio?: string; frames?: number; paths?: boolean } = {};
    const real = await evaluate(realClipDir("real-same", true), {
      kind: "real",
      providers: fakeProviders(seen),
      media: fakeMedia(32_000),
    });
    const mocked = await evaluate(CLIPS);
    expect(real.providers).toBe("fake-transcription + fake-vision");
    expect(real.clipsRun).toEqual(["example"]);
    expect(real.scores[0]).toEqual(mocked.scores.find((s) => s.clip === "example"));
    // Audio and frames were cut in a temporary folder that is gone afterwards.
    expect(seen.audio).toMatch(/sleuth-eval-/);
    expect(existsSync(seen.audio ?? "")).toBe(false);
    // planFrames: 0 to 32000 ms every 2000 ms, both ends included.
    expect(seen.frames).toBe(17);
    expect(seen.paths).toBe(true);
  });

  it("skips a clip with no video and says which file is missing", async () => {
    const result = await evaluate(realClipDir("real-novideo", false), {
      kind: "real",
      providers: fakeProviders({}),
      media: fakeMedia(32_000),
    });
    expect(result.skipped).toEqual([
      {
        clip: "example",
        reason: "no example.mp4 in the clip folder (needed for --providers real)",
      },
    ]);
  });

  it("refuses a video over 180 seconds before any provider call", async () => {
    const seen: { audio?: string } = {};
    await expect(
      evaluate(realClipDir("real-long", true), {
        kind: "real",
        providers: fakeProviders(seen),
        media: fakeMedia(180_001),
      }),
    ).rejects.toThrow("probe: duration_exceeded");
    expect(seen.audio).toBeUndefined();
  });

  it("names providers and models in the header, never a key", () => {
    const p = providersFromEnv({
      TRANSCRIPTION_API_KEY: "k1-do-not-print",
      VIDEO_ANALYSIS_API_KEY: "k2-do-not-print",
    });
    expect(p.label).toBe(
      "deepgram (nova-3) + gemini (gemini-3.8-flash, fallback gemini-3.6-flash)",
    );
    const same = providersFromEnv({
      TRANSCRIPTION_API_KEY: "a",
      VIDEO_ANALYSIS_API_KEY: "b",
      VIDEO_ANALYSIS_MODEL: "gemini-3.6-flash",
      VIDEO_ANALYSIS_FALLBACK_MODEL: "gemini-3.6-flash",
    });
    expect(same.label).toBe("deepgram (nova-3) + gemini (gemini-3.6-flash)");
    expect(p.fallbacks()).toBe(0);
  });
});
