import { describe, expect, it } from "vitest";
import { normaliseAndHash, normaliseText, tokenise } from "./normalise";

describe("normaliseText", () => {
  it("lower-cases and drops sentence punctuation", () => {
    expect(normaliseText("Click Export.")).toBe("click export");
  });

  it("collapses whitespace", () => {
    expect(normaliseText("  click \n\t export  ")).toBe("click export");
  });

  it.each(["3.5", "1,000", "10:30", "don't", "e-mail"])("keeps %s whole", (token) => {
    expect(tokenise(`Use ${token} today.`)).toContain(token);
  });

  it("treats curly and straight apostrophes the same", () => {
    expect(normaliseText("Don\u2019t stop")).toBe(normaliseText("Don't stop"));
  });

  it("treats en dash and hyphen the same inside a word", () => {
    expect(normaliseText("e\u2013mail")).toBe("e-mail");
  });

  it("drops quotes and brackets", () => {
    expect(normaliseText('He said "export" (now)!')).toBe("he said export now");
  });

  it("returns an empty string for punctuation only", () => {
    expect(normaliseText("... !!!")).toBe("");
  });
});

describe("normaliseAndHash", () => {
  it("hashes Click Export. and click export the same", () => {
    expect(normaliseAndHash("Click Export.")).toBe(normaliseAndHash("click export"));
  });

  it("hashes 3.5 and 35 differently", () => {
    expect(normaliseAndHash("Pay 3.5 dollars")).not.toBe(normaliseAndHash("Pay 35 dollars"));
  });

  it("hashes 1,000 and 1000 differently", () => {
    expect(normaliseAndHash("1,000 users")).not.toBe(normaliseAndHash("1000 users"));
  });

  it("returns 64 hex characters", () => {
    expect(normaliseAndHash("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
