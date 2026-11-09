import { describe, expect, it } from "vitest";
import { OUTSIDE_PROOF_GROUPS, classify } from "./outside-proof-terms";
import { needsOutsideProof } from "./text";

const MUST_FLAG: [phrase: string, kind: string][] = [
  ["All customer data is encrypted end to end.", "security"],
  ["Your files are stored with strong encryption.", "security"],
  ["The platform is secure by design.", "security"],
  ["We take security seriously.", "security"],
  ["ProofPay is GDPR compliant.", "compliance"],
  ["The service is GDPR-compliant.", "compliance"],
  ["We are HIPAA certified.", "compliance"],
  ["We guarantee your invoices arrive.", "guarantee"],
  ["Enjoy 99.9 percent uptime.", "performance"],
  ["ProofPay is the fastest invoicing tool.", "performance"],
  ["Your data is never shared with anyone.", "absolute"],
  ["Backups always run on time.", "absolute"],
];

const ORDINARY_STEPS = [
  "Click New Invoice to start a draft.",
  "Enter the client name and the amount.",
  "Click Export to download the invoice as a PDF.",
  "Open the settings page.",
  "Select the blue Save button.",
  "The preview shows the invoice number.",
  "Type the client email into the field.",
  "Scroll down to the payment section.",
  "Press Enter to confirm the amount.",
  "Thanks for watching.",
  "The insecure example is only a mock screen.",
  "Choose a due date from the calendar.",
];

describe("classify", () => {
  it.each(MUST_FLAG)("flags %s", (phrase, kind) => {
    const match = classify(phrase);
    expect(match).not.toBeNull();
    expect(match?.kind).toBe(kind);
    expect(needsOutsideProof(phrase)).toBe(true);
  });

  it.each(ORDINARY_STEPS)("does not flag the ordinary step %s", (phrase) => {
    expect(classify(phrase)).toBeNull();
    expect(needsOutsideProof(phrase)).toBe(false);
  });

  it("tests at least 10 phrases that are flagged and 10 that are not", () => {
    expect(MUST_FLAG.length).toBeGreaterThanOrEqual(10);
    expect(ORDINARY_STEPS.length).toBeGreaterThanOrEqual(10);
  });

  it("names the word that made the claim and the kind of proof that could back it up", () => {
    const match = classify("All customer data is encrypted end to end.");
    expect(match?.term).toBe("encrypted");
    expect(match?.hint).toMatch(/security report/);
  });

  it("ignores case and punctuation", () => {
    expect(classify("ALWAYS!")?.term).toBe("always");
    expect(classify("(Never.)")?.term).toBe("never");
  });

  it("returns null for empty text", () => {
    expect(classify("")).toBeNull();
  });
});

describe("the term list", () => {
  it("has a hint for every group and no empty group", () => {
    for (const group of OUTSIDE_PROOF_GROUPS) {
      expect(group.hint.length).toBeGreaterThan(0);
      expect(group.terms.length).toBeGreaterThan(0);
    }
  });

  it("holds only lower-case single words, each in one group", () => {
    const seen = new Set<string>();
    for (const group of OUTSIDE_PROOF_GROUPS) {
      for (const term of group.terms) {
        expect(term).toBe(term.toLowerCase());
        expect(term).toMatch(/^[a-z0-9]+$/);
        expect(seen.has(term)).toBe(false);
        seen.add(term);
      }
    }
  });
});
