import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { segmentScript } from "@sleuth/domain";
import { needsOutsideProof } from "@sleuth/evidence-engine";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ClipSchema as HarnessClipSchema } from "../../schema";

/**
 * Checks the clip-3 folder (evidence-analysis 11) so that only the recording and the labels are
 * missing. Before the recording, the recorded fields must be empty. After it, they must be real.
 * Case: one security claim that a video cannot prove.
 */

const dir = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const clip = JSON.parse(readFileSync(dir("clip.json"), "utf8")) as unknown;

const ClipSchema = z.object({
  name: z.literal("clip-3"),
  recordedBy: z.string().min(1),
  labelledBy: z.string().min(1).nullable(),
  recordedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  durationMs: z.number().int().min(60_000).max(120_000).nullable(),
  video: z.object({
    fileName: z.literal("clip-3.mp4"),
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

describe("evaluation clip-3", () => {
  const parsed = ClipSchema.parse(clip);
  const recorded = parsed.durationMs !== null;

  it("is a valid clip for the evaluation harness", () => {
    expect(() => HarnessClipSchema.parse(clip)).not.toThrow();
  });

  it("has a script that splits into exactly its own lines", () => {
    const segments = segmentScript(parsed.script.join("\n"), { scriptVersionId: "clip-3" });
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

  it("is recorded and labelled by different people (decision D-10)", () => {
    if (parsed.labelledBy !== null) expect(parsed.labelledBy).not.toBe(parsed.recordedBy);
  });

  it("never sends a secret or a real account from demo.ps1", () => {
    const demo = readFileSync(dir("demo.ps1"), "utf8");
    expect(demo).toContain('"x-fixture-user"');
    expect(demo).not.toMatch(/authorization|apikey|supabase\.co|postgres(ql)?:\/\//i);
  });

  it("has exactly one line footage cannot prove, the security claim on line 5", () => {
    const flagged = parsed.script
      .map((line, i) => (needsOutsideProof(line) ? i + 1 : null))
      .filter((n) => n !== null);
    expect(flagged).toEqual([5]);
  });

  it("shows nothing on screen that could back the claim", () => {
    const demo = readFileSync(dir("demo.ps1"), "utf8").toLowerCase();
    for (const word of ["encrypt", "security", "settings"]) expect(demo).not.toContain(word);
  });
});
