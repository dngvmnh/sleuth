import { tokenise } from "@sleuth/domain";

/**
 * Claims that footage alone cannot prove (see `.kiro/steering/ai-safety.md`). To teach SLEUTH a new
 * claim, add its lower-case word to a group below. Nothing else needs to change.
 *
 * Words are matched whole, so "secure" does not match "insecure". A hyphenated word is also
 * checked piece by piece, so "GDPR-compliant" matches "gdpr" and "compliant".
 */
export interface OutsideProofGroup {
  /** Short name of the kind of claim. */
  kind: string;
  /** The kind of proof that could back the claim up. Shown to the person who reviews the finding. */
  hint: string;
  /** Lower-case words that make the claim. */
  terms: readonly string[];
}

export const OUTSIDE_PROOF_GROUPS: readonly OutsideProofGroup[] = [
  {
    kind: "security",
    hint: "a security report, architecture document or penetration test summary",
    terms: ["encrypted", "encryption", "encrypt", "encrypts", "secure", "secured", "security"],
  },
  {
    kind: "compliance",
    hint: "a compliance certificate or audit report",
    terms: ["compliant", "compliance", "gdpr", "hipaa", "certified", "certification"],
  },
  {
    kind: "guarantee",
    hint: "a contract, service agreement or policy document",
    terms: ["guarantee", "guaranteed", "guarantees"],
  },
  {
    kind: "performance",
    hint: "a benchmark or monitoring report",
    terms: ["uptime", "fastest"],
  },
  {
    kind: "absolute",
    hint: "a specification or test results that cover every case",
    terms: ["always", "never"],
  },
];

export interface OutsideProofMatch {
  /** The word in the text that made the claim. */
  term: string;
  kind: string;
  /** The kind of proof that could back the claim up. */
  hint: string;
}

const TERM_INDEX: ReadonlyMap<string, OutsideProofGroup> = new Map(
  OUTSIDE_PROOF_GROUPS.flatMap((group) => group.terms.map((term) => [term, group] as const)),
);

/** The first claim in `text` that footage cannot prove, or null when there is none. */
export function classify(text: string): OutsideProofMatch | null {
  for (const token of tokenise(text)) {
    for (const piece of [token, ...token.split("-")]) {
      const group = TERM_INDEX.get(piece);
      if (group) return { term: piece, kind: group.kind, hint: group.hint };
    }
  }
  return null;
}
