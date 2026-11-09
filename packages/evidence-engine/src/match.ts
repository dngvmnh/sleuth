import type { Confidence, FrameObservation } from "@sleuth/contracts";
import type { AlignmentLabel } from "./align";
import { contentTokens } from "./text";
import { FRAME_WINDOW_MS } from "./thresholds";

export interface SpokenInterval {
  startMs: number;
  endMs: number;
}

export interface FrameMatch {
  observation: FrameObservation;
  /** How many of the line's key words appear in the frame's description or on-screen text. */
  sharedWords: number;
  /** True when the frame sits inside the spoken interval, not only inside the wider window. */
  insideSpoken: boolean;
}

/**
 * Frames within `FRAME_WINDOW_MS` of the spoken interval that share at least one key word with
 * the script line, in the order they were given.
 */
export function matchFrames(
  lineTokens: readonly string[],
  spoken: SpokenInterval,
  observations: readonly FrameObservation[],
): FrameMatch[] {
  const from = spoken.startMs - FRAME_WINDOW_MS;
  const to = spoken.endMs + FRAME_WINDOW_MS;
  const matches: FrameMatch[] = [];
  for (const observation of observations) {
    if (observation.timestampMs < from || observation.timestampMs > to) continue;
    const frameTokens = contentTokens(
      `${observation.description} ${observation.onScreenText.join(" ")}`,
    );
    const sharedWords = lineTokens.filter((token) => frameTokens.includes(token)).length;
    if (sharedWords < 1) continue;
    matches.push({
      observation,
      sharedWords,
      insideSpoken:
        observation.timestampMs >= spoken.startMs && observation.timestampMs <= spoken.endMs,
    });
  }
  return matches;
}

/** A frame must share this many key words with the line to count as strong. */
export const STRONG_FRAME_WORDS = 2;

export interface ConfidenceInput {
  outsideProof: boolean;
  label: AlignmentLabel;
  matches: readonly FrameMatch[];
}

/**
 * Confidence is a ranking signal for the person who checks the match. It is not proof and not a
 * probability. The rules are written out in `docs/evidence-confidence.md`:
 *
 * - low: the claim is outside proof (footage cannot show it), or nothing else applies.
 * - high: the line was spoken as written (`exact`) and a frame inside the spoken interval shares
 *   at least `STRONG_FRAME_WORDS` key words with it.
 * - medium: a frame matches, but the line was changed or reordered, or the best frame shares only
 *   one key word, or the strong frame lies outside the spoken interval.
 */
export function rankConfidence(input: ConfidenceInput): Confidence {
  if (input.outsideProof) return "low";
  if (input.matches.length === 0) return "low";
  const strongInside = input.matches.some(
    (m) => m.insideSpoken && m.sharedWords >= STRONG_FRAME_WORDS,
  );
  return input.label === "exact" && strongInside ? "high" : "medium";
}

/** The most key words any one frame shares with the line (0 when there are no matches). */
export function bestSharedWords(matches: readonly FrameMatch[]): number {
  return Math.max(0, ...matches.map((m) => m.sharedWords));
}
