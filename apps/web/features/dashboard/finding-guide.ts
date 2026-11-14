import type { FindingType } from "@sleuth/contracts";

/** Shown in the order a review usually meets them. */
export const FINDING_ORDER: FindingType[] = [
  "ghost",
  "phantom_dialogue",
  "cursed_frame",
  "poltergeist",
  "needs_outside_proof",
];

export type FindingTag = "blocks" | "person" | "outside";

export const TAG_TEXT: Record<FindingTag, string> = {
  blocks: "Blocks the seal",
  person: "Needs a person",
  outside: "Outside proof",
};

export interface FindingGuide {
  tag: FindingTag;
  /** One plain sentence: what the check looked for. */
  found: string;
  /** One plain sentence: what clears it. */
  clear: string;
}

/**
 * How each finding is raised and cleared, in plain words. Taken from the real rules:
 * `packages/evidence-engine/src/analyse.ts` raises them, and `packages/domain/src/seal.ts`
 * decides what blocks the Final Seal (undecided candidates, stale evidence, uncovered
 * checklist items). Change this when those rules change.
 */
export const FINDING_GUIDE: Record<FindingType, FindingGuide> = {
  ghost: {
    tag: "blocks",
    found: "No line in the video shows this checklist item on screen.",
    clear: "Film the step, upload the new video and run the check again.",
  },
  phantom_dialogue: {
    tag: "person",
    found: "The script line was not matched to anything said in the video.",
    clear: "Say the line in a new take, or change the script to match.",
  },
  cursed_frame: {
    tag: "blocks",
    found: "The words were said, but the screen matched them only in part.",
    clear: "A person watches the part and confirms or rejects it.",
  },
  poltergeist: {
    tag: "blocks",
    found: "The script line or the video changed after the evidence was found.",
    clear: "Run the check again for the changed lines.",
  },
  needs_outside_proof: {
    tag: "outside",
    found: "The claim is one video cannot show, such as a security or legal point.",
    clear: "A person marks it, and the report lists it for proof outside the video.",
  },
};
