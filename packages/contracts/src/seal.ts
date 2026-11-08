import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./entities";

export const CoverageStateSchema = z.enum([
  "proven",
  "needs_review",
  "outside_proof",
  "reshoot",
  "uncovered",
]);
export type CoverageState = z.infer<typeof CoverageStateSchema>;
export const COVERAGE_STATES = CoverageStateSchema.options;

export const CoverageItemSchema = z.object({
  checklistItemId: IdSchema,
  state: CoverageStateSchema,
  /** Evidence on this item that is not stale. */
  evidenceIds: z.array(IdSchema),
});
export type CoverageItem = z.infer<typeof CoverageItemSchema>;

export const OutsideProofItemSchema = z.object({
  scriptSegmentId: IdSchema,
  /** What kind of proof could back the claim. */
  hint: z.string().min(1),
  /** A person marked it as needing outside proof (the engine only proposes it). */
  acknowledged: z.boolean(),
});
export type OutsideProofItem = z.infer<typeof OutsideProofItemSchema>;

export const CoverageSummarySchema = z.object({
  items: z.array(CoverageItemSchema),
  totals: z.object({
    proven: z.number().int().nonnegative(),
    needs_review: z.number().int().nonnegative(),
    outside_proof: z.number().int().nonnegative(),
    reshoot: z.number().int().nonnegative(),
    uncovered: z.number().int().nonnegative(),
  }),
  /** Whole percent of checklist items that are proven, 0 to 100. */
  provenPercent: z.number().int().min(0).max(100),
  outsideProof: z.array(OutsideProofItemSchema),
  openReshootIds: z.array(IdSchema),
});
export type CoverageSummary = z.infer<typeof CoverageSummarySchema>;

export const SealBlockerSchema = z.enum([
  "undecided_candidates",
  "stale_evidence",
  "uncovered_items",
  "job_running",
  "no_analysis",
]);
export type SealBlocker = z.infer<typeof SealBlockerSchema>;

export const SealSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  /** The person who signed off. */
  sealedBy: z.string().min(1),
  sealedAt: IsoDateSchema,
  scriptVersionId: IdSchema,
  assetVersionId: IdSchema,
  /** Coverage as it was at sign-off. */
  coverage: CoverageSummarySchema,
  note: z.string().max(1000).nullable(),
  status: z.enum(["active", "broken"]),
  brokenAt: IsoDateSchema.nullable(),
  brokenReason: z.string().nullable(),
});
export type Seal = z.infer<typeof SealSchema>;
