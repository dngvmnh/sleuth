import { describe, expect, it } from "vitest";
import { segmentScript, splitSentences } from "./segment";

const opts = { scriptVersionId: "sv1" };

describe("splitSentences", () => {
  it("splits on sentence ends followed by a capital", () => {
    expect(splitSentences("Hello there. Click New Invoice. Done!")).toEqual([
      "Hello there.",
      "Click New Invoice.",
      "Done!",
    ]);
  });

  it("does not split inside decimals", () => {
    expect(splitSentences("It costs 3.5 dollars.")).toEqual(["It costs 3.5 dollars."]);
  });

  it("treats each line as its own sentence and skips blank lines", () => {
    expect(splitSentences("first line\n\nsecond line\r\nthird")).toEqual([
      "first line",
      "second line",
      "third",
    ]);
  });

  it("drops punctuation-only fragments", () => {
    expect(splitSentences("...\nReal text.")).toEqual(["Real text."]);
  });
});

describe("segmentScript", () => {
  it("gives sequential ids and indexes to a first version", () => {
    const segs = segmentScript("One thing. Two things.", opts);
    expect(segs.map((s) => [s.id, s.index])).toEqual([
      ["seg-1", 0],
      ["seg-2", 1],
    ]);
  });

  it("keeps the id of an unchanged sentence that moved", () => {
    const v1 = segmentScript("Alpha step. Beta step.", opts);
    const v2 = segmentScript("Beta step. Alpha step.", { ...opts, previous: v1 });
    expect(v2.map((s) => s.id)).toEqual(["seg-2", "seg-1"]);
  });

  it("keeps the id of an edited sentence at the same position", () => {
    const v1 = segmentScript("Alpha step. Beta step.", opts);
    const v2 = segmentScript("Alpha step. Gamma step.", { ...opts, previous: v1 });
    expect(v2.map((s) => s.id)).toEqual(["seg-1", "seg-2"]);
    expect(v2[1]?.hash).not.toBe(v1[1]?.hash);
  });

  it("gives an inserted sentence a fresh id above the old maximum", () => {
    const v1 = segmentScript("Alpha step. Beta step.", opts);
    const v2 = segmentScript("Alpha step. New step. Beta step.", { ...opts, previous: v1 });
    expect(v2.map((s) => s.id)).toEqual(["seg-1", "seg-3", "seg-2"]);
  });

  it("does not reuse the id of a removed sentence", () => {
    const v1 = segmentScript("Alpha step. Beta step.", opts);
    const v2 = segmentScript("Alpha step.", { ...opts, previous: v1 });
    const v3 = segmentScript("Alpha step. Fresh step.", {
      ...opts,
      previous: v2,
      retiredIds: ["seg-2"],
    });
    expect(v3[1]?.id).toBe("seg-3");
  });
});
