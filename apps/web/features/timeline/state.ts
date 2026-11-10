import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";
import type { SegmentState } from "@sleuth/domain";

/**
 * Frontend presentation of segment states. The states themselves come from
 * `deriveSegmentStates` in `@sleuth/domain` (change-impact task 2); the UI never works them out.
 */
export type { SegmentState };

export interface StateLabel {
  /** Short name; for finding-related states this is the spooky name. */
  name: string;
  /** Ordinary-language label, always shown beside the name. */
  plain: string;
  findingType: FindingType | null;
}

/** Labels for each state. Spooky names come from `FINDING_LABELS`, never retyped. */
export const STATE_LABELS: Record<SegmentState, StateLabel> = {
  covered: { name: "Covered", plain: "A person confirmed the evidence", findingType: null },
  needs_review: {
    name: FINDING_LABELS.cursed_frame.spooky,
    plain: FINDING_LABELS.cursed_frame.plain,
    findingType: "cursed_frame",
  },
  stale: {
    name: FINDING_LABELS.poltergeist.spooky,
    plain: FINDING_LABELS.poltergeist.plain,
    findingType: "poltergeist",
  },
  uncovered: {
    name: FINDING_LABELS.ghost.spooky,
    plain: FINDING_LABELS.ghost.plain,
    findingType: "ghost",
  },
  outside_proof: {
    name: FINDING_LABELS.needs_outside_proof.spooky,
    plain: FINDING_LABELS.needs_outside_proof.plain,
    findingType: "needs_outside_proof",
  },
};
