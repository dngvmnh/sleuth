import { tokenise } from "@sleuth/domain";

const STOPWORDS = new Set(
  (
    "a an and are as at be by for from has have i in is it its of on or our so that the their " +
    "then this to we will with you your now here there into out up all can first next"
  ).split(" "),
);

/** Normalised tokens without filler words. Used for matching only. */
export function contentTokens(text: string): string[] {
  return tokenise(text).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Share of `needles` found in `haystack` (0 when `needles` is empty). */
export function coverage(needles: readonly string[], haystack: readonly string[]): number {
  if (needles.length === 0) return 0;
  const have = new Set(haystack);
  return needles.filter((t) => have.has(t)).length / needles.length;
}

/** m:ss for explanations. */
export function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Claims that footage alone cannot prove (see ai-safety.md). */
const OUTSIDE_PROOF_TERMS = new Set([
  "encrypted",
  "encryption",
  "secure",
  "secured",
  "security",
  "guarantee",
  "guaranteed",
  "compliant",
  "compliance",
  "gdpr",
  "hipaa",
  "certified",
  "uptime",
  "fastest",
  "always",
  "never",
]);

export function needsOutsideProof(text: string): boolean {
  return tokenise(text).some((t) => OUTSIDE_PROOF_TERMS.has(t));
}
