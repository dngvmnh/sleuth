import type { CoverageState, Seal } from "@sleuth/contracts";
import type { SignerLabel } from "./signer";

/**
 * Report wording shared by the page. It matches the CSV and HTML exports
 * (`app/api/_lib/report.ts`), so the page and the exports say the same thing.
 * That module is server code (it imports the db package), so the text is kept here too.
 */

export const COVERAGE_LABELS: Record<CoverageState, { name: string; meaning: string }> = {
  proven: { name: "Proven", meaning: "a person confirmed the evidence" },
  needs_review: { name: "Needs review", meaning: "candidates nobody has decided on" },
  outside_proof: { name: "Needs outside proof", meaning: "a person marked it, footage cannot prove it" },
  reshoot: { name: "Needs a reshoot", meaning: "a person asked for new footage" },
  uncovered: { name: "Uncovered", meaning: "no usable evidence" },
};

/** Display order of states in the totals. */
export const COVERAGE_ORDER: CoverageState[] = ["proven", "needs_review", "outside_proof", "reshoot", "uncovered"];

export const HONESTY_NOTES = [
  "Matches in this report are candidates found by software. Only a person can confirm them.",
  "Confidence is a ranking, not proof.",
  "Footage cannot prove claims about security, compliance or guarantees. Those need proof from outside the video.",
  "Checks look at sampled frames and speech to text, so they can miss a quick action or a misheard word.",
];

export const DRAFT_TEXT = "Draft: not signed off";
export const BROKEN_TEXT = "Seal broken: evidence changed after sign-off";

export type SealBanner = {
  status: "draft" | "sealed" | "broken";
  title: string;
  detail: string | null;
  /** The signer's raw id, for auditors only: shown in a closed <details>, never as plain text. */
  auditId: string | null;
};

/** `signer` is the readable label from `signerLabel` (features/report/signer.ts), never a raw id. */
export function sealBanner(seal: Seal | null, signer: SignerLabel = "a reviewer"): SealBanner {
  if (!seal) {
    return {
      status: "draft",
      title: DRAFT_TEXT,
      detail: "Nobody has applied the Final Seal. Everything below is a working draft.",
      auditId: null,
    };
  }
  if (seal.status === "broken") {
    return { status: "broken", title: BROKEN_TEXT, detail: seal.brokenReason, auditId: seal.sealedBy };
  }
  return {
    status: "sealed",
    title: "Sealed",
    detail: `Signed off by ${signer} at ${seal.sealedAt.slice(0, 16).replace("T", " ")} UTC.`,
    auditId: seal.sealedBy,
  };
}
