import type { FindingType } from "./entities";

export interface FindingLabel {
  /** Haunted-studio name. */
  spooky: string;
  /** Ordinary-language name. Always shown beside the spooky one. */
  plain: string;
  /** One-sentence meaning. */
  meaning: string;
}

export const FINDING_LABELS: Record<FindingType, FindingLabel> = {
  ghost: {
    spooky: "Ghost",
    plain: "No visual evidence",
    meaning: "A claim or checklist item has no matching footage.",
  },
  phantom_dialogue: {
    spooky: "Phantom Dialogue",
    plain: "Script line not spoken",
    meaning: "A script line was not found in the spoken audio.",
  },
  cursed_frame: {
    spooky: "Cursed Frame",
    plain: "Needs human check",
    meaning: "Candidate footage that a person must confirm.",
  },
  poltergeist: {
    spooky: "Poltergeist",
    plain: "Evidence out of date",
    meaning: "A script or video change made this evidence stale.",
  },
  needs_outside_proof: {
    spooky: "Needs Outside Proof",
    plain: "Footage cannot prove this",
    meaning: "A claim that video cannot show, such as a security or legal statement.",
  },
};
