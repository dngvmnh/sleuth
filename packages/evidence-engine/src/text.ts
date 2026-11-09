import { tokenise } from "@sleuth/domain";
import { classify } from "./outside-proof-terms";

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

/** True when the text makes a claim that footage alone cannot prove (see `outside-proof-terms.ts`). */
export function needsOutsideProof(text: string): boolean {
  return classify(text) !== null;
}
