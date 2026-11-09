import { describe, expect, it } from "vitest";
import type { TranscriptSegment } from "@sleuth/contracts";
import { segmentScript } from "@sleuth/domain";
import { align } from "./align";
import { SPOKEN_MIN_COVERAGE, SPOKEN_STRONG_COVERAGE } from "./thresholds";

const script = (lines: string[]) => segmentScript(lines.join("\n"), { scriptVersionId: "sv-1" });

const spoken = (lines: string[]): TranscriptSegment[] =>
  lines.map((text, i) => ({
    id: `t${i + 1}`,
    projectId: "p1",
    assetVersionId: "av1",
    startMs: i * 5000,
    endMs: i * 5000 + 4000,
    text,
    words: [],
  }));

const labels = (lines: string[], said: string[]) =>
  align(script(lines), spoken(said)).aligned.map((a) => a.label);

describe("align", () => {
  it("labels a line spoken as written as exact", () => {
    const lines = ["Click New Invoice to start a draft.", "Click Export to download the invoice."];
    const result = align(script(lines), spoken(lines));
    expect(result.aligned.map((a) => a.label)).toEqual(["exact", "exact"]);
    expect(result.aligned.map((a) => a.transcriptId)).toEqual(["t1", "t2"]);
    expect(result.unscripted).toEqual([]);
  });

  it("labels a line with some words changed as changed", () => {
    // 3 of the 4 key words (75%) are spoken: between the two thresholds.
    const result = align(
      script(["Enter client amount invoice."]),
      spoken(["Now I enter the client and the amount."]),
    );
    const only = result.aligned[0];
    expect(only?.label).toBe("changed");
    expect(only?.coverage).toBeGreaterThanOrEqual(SPOKEN_MIN_COVERAGE);
    expect(only?.coverage).toBeLessThan(SPOKEN_STRONG_COVERAGE);
  });

  it("labels a line nobody said as missing and gives it no transcript segment", () => {
    const result = align(
      script(["Click New Invoice to start a draft.", "Open the settings page."]),
      spoken(["Click New Invoice to start a draft."]),
    );
    expect(result.aligned[1]).toMatchObject({ label: "missing", transcriptId: null, coverage: 0 });
  });

  it("labels the lines said in the wrong order as reordered", () => {
    const lines = [
      "Click New Invoice to start a draft.",
      "Enter the client name and the amount.",
      "Click Export to download the invoice.",
    ];
    const said = [lines[0] ?? "", lines[2] ?? "", lines[1] ?? ""];
    const result = labels(lines, said);
    expect(result.filter((l) => l === "reordered")).toHaveLength(1);
    expect(result.filter((l) => l === "exact")).toHaveLength(2);
  });

  it("lists spoken lines that no script line uses as unscripted, in time order", () => {
    const result = align(
      script(["Click New Invoice to start a draft."]),
      spoken([
        "Welcome everyone to this short tour.",
        "Click New Invoice to start a draft.",
        "Then I save it and check the preview.",
      ]),
    );
    expect(result.unscripted).toEqual(["t1", "t3"]);
    expect(result.aligned[0]?.transcriptId).toBe("t2");
  });

  it("uses a spoken segment for one line only when the lines differ", () => {
    // One spoken sentence cannot serve two different script lines.
    const result = align(
      script(["Click New Invoice to start a draft.", "Click New Invoice to start a draft today."]),
      spoken(["Click New Invoice to start a draft today."]),
    );
    const used = result.aligned.filter((a) => a.transcriptId === "t1");
    expect(used).toHaveLength(1);
    expect(result.aligned.filter((a) => a.label === "missing")).toHaveLength(1);
  });

  it("pairs two identical lines with two identical spoken lines in order", () => {
    const line = "Click Save to keep the invoice.";
    const result = align(script([line, line]), spoken([line, line]));
    expect(result.aligned.map((a) => a.transcriptId)).toEqual(["t1", "t2"]);
    expect(result.aligned.map((a) => a.label)).toEqual(["exact", "exact"]);
  });

  it("orders spoken segments by time, not by their place in the array", () => {
    const lines = ["Click New Invoice to start a draft.", "Click Export to download the invoice."];
    const said = spoken(lines).reverse();
    const result = align(script(lines), said);
    expect(result.aligned.map((a) => a.label)).toEqual(["exact", "exact"]);
  });

  it("returns every line as missing when there is no speech", () => {
    const result = align(script(["Click New Invoice.", "Click Export."]), []);
    expect(result.aligned.map((a) => a.label)).toEqual(["missing", "missing"]);
    expect(result.unscripted).toEqual([]);
  });

  it("returns nothing for an empty script", () => {
    const result = align([], spoken(["Hello there everyone."]));
    expect(result.aligned).toEqual([]);
    expect(result.unscripted).toEqual(["t1"]);
  });
});
