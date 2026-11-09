import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { segmentScript } from "@sleuth/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Checks the clip-5 folder (evidence-analysis 15) so that only the recording and the labels are
 * missing. Before the recording, the recorded fields must be empty. After it, they must be real.
 * The format follows design.md until evidence-analysis 9 fixes it.
 */

const dir = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const clip = JSON.parse(readFileSync(dir("clip.json"), "utf8")) as unknown;

const ClipSchema = z.object({
  name: z.literal("clip-5"),
  recordedBy: z.string().min(1),
  labelledBy: z.string().min(1).nullable(),
  recordedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  durationMs: z.number().int().min(60_000).max(120_000).nullable(),
  video: z.object({
    fileName: z.literal("clip-5.mp4"),
    inGit: z.literal(false),
    storedAt: z.string().min(1).nullable(),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
  }),
  script: z.array(z.string().min(1)).min(6),
  checklist: z.array(z.string().min(1).max(300)).min(1),
});

describe("evaluation clip-5", () => {
  const parsed = ClipSchema.parse(clip);
  const recorded = parsed.durationMs !== null;

  it("has a script that splits into exactly its own lines", () => {
    const segments = segmentScript(parsed.script.join("\n"), { scriptVersionId: "clip-5" });
    expect(segments.map((s) => s.text)).toEqual(parsed.script);
  });

  it("matches the lines in RECORDING.md, so the presenter reads the labelled script", () => {
    const page = readFileSync(dir("RECORDING.md"), "utf8");
    for (const [i, line] of parsed.script.entries()) {
      expect(page, `script line ${i + 1}`).toContain(`${i + 1}. ${line}`);
    }
  });

  it("keeps recorded fields all empty before the recording, or all filled after it", () => {
    const fields = [
      parsed.durationMs,
      parsed.recordedOn,
      parsed.video.sha256,
      parsed.video.storedAt,
    ];
    expect(fields.every((f) => f === null) || fields.every((f) => f !== null)).toBe(true);
  });

  it("is labelled only after it is recorded, and by a named person", () => {
    const labels = existsSync(dir("labels.json"));
    if (!recorded) {
      expect(labels, "labels.json before the clip exists").toBe(false);
      expect(parsed.labelledBy).toBeNull();
      return;
    }
    // The recording and its labels land in the same PR.
    expect(labels, "labels.json once the clip is recorded").toBe(true);
    expect(parsed.labelledBy).not.toBeNull();
  });
});
