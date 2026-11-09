/**
 * Every number that decides a match lives here. `docs/evidence-confidence.md` describes them in
 * plain English and a test imports these same constants, so the text and the code cannot drift.
 */

/** A script line counts as spoken when this share of its key words appears in one transcript segment. */
export const SPOKEN_MIN_COVERAGE = 0.6;

/** At or above this share the spoken line is an exact match; between the two it is "changed". */
export const SPOKEN_STRONG_COVERAGE = 0.85;

/** Frames within this many ms of the spoken line count as "on screen while said". */
export const FRAME_WINDOW_MS = 2000;

/** A script line serves a checklist item when this share of the item's key words is in the line. */
export const CHECKLIST_MIN_COVERAGE = 0.5;
