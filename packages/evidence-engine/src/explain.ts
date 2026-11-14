import type { Finding } from "@sleuth/contracts";
import type { AlignmentLabel } from "./align";
import { formatMs } from "./text";

/**
 * Every explanation says what was found, what was not found, and the limits of the check. They are
 * built here from typed numbers only, so they never repeat transcript text, frame text or anything
 * else a provider returned. Confidence is described as a ranking, never as proof.
 */
export type FindingParts = Pick<Finding, "found" | "notFound" | "limits">;

export function explainPhantomDialogue(): FindingParts {
  return {
    found: "The script line exists.",
    notFound: "No spoken sentence in the transcript covers enough of its words.",
    limits:
      "Speech to text can miss words, and the presenter may have said it differently. Listen to the clip.",
  };
}

export function explainNeedsOutsideProof(): FindingParts {
  return {
    found: "The script makes a claim about security, guarantees or compliance.",
    notFound: "Footage cannot show this. No visual check was attempted.",
    limits: "Needs a document, certificate or other proof from outside the video.",
  };
}

export function explainCursedFrame(input: { matchedFrames: number }): FindingParts {
  return {
    found:
      input.matchedFrames === 1
        ? "1 frame near the spoken line shares words with it."
        : `${input.matchedFrames} frames near the spoken line share words with it.`,
    notFound: "Not every key word of the line was seen on screen.",
    limits: "Matching compares words only. Watch the clip to confirm it shows the step.",
  };
}

export function explainGhost(input: { lineExists: boolean; speechOnly?: boolean }): FindingParts {
  const found = input.lineExists
    ? "A script line points at this item."
    : "No script line points at this item.";
  // Speech only (decision D-4): no frame was looked at, so do not claim a frame search failed.
  if (input.speechOnly)
    return {
      found,
      notFound: "No frames were checked, so nothing on screen could be found for this item.",
      limits: "Watch the clip, or run the analysis with video analysis, to check the screen.",
    };
  return {
    found,
    notFound: "No frame near a matching spoken line shows it.",
    limits:
      "Frames are sampled, so a quick action between samples can be missed. Scrub the video to check.",
  };
}

export interface EvidenceExplanationInput {
  startMs: number;
  endMs: number;
  /** Share of the line's key words found in the spoken segment, 0 to 1. */
  coverage: number;
  label: AlignmentLabel;
  outsideProof: boolean;
  matchedFrames: number;
  bestSharedWords: number;
}

export function explainEvidence(input: EvidenceExplanationInput): string {
  const spoken = `Spoken at ${formatMs(input.startMs)}-${formatMs(input.endMs)} (${Math.round(input.coverage * 100)}% of the line's key words).`;
  const order = input.label === "reordered" ? " It was spoken out of the script's order." : "";
  if (input.outsideProof) {
    return `${spoken}${order} This claim cannot be proven by footage, so it needs proof from outside the video.`;
  }
  const frames = `${input.matchedFrames} nearby frame${input.matchedFrames === 1 ? "" : "s"} share${input.matchedFrames === 1 ? "s" : ""}`;
  const words = `${input.bestSharedWords} key word${input.bestSharedWords === 1 ? "" : "s"}`;
  return `${spoken}${order} ${frames} up to ${words} with the line. Confidence ranks this match; a person must confirm it.`;
}
