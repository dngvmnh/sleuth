import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateObservations, validateTranscript } from "./validate";

const DURATION = fc.integer({ min: 0, max: 180_000 });

/** A number a provider could send: good, fractional, negative, NaN, infinite or far out of range. */
const msLike = fc.oneof(
  fc.integer({ min: 0, max: 200_000 }),
  fc.integer({ min: -50_000, max: -1 }),
  fc.double({ min: 0, max: 200_000, noNaN: true }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

const wordLike = fc.record({
  text: fc.string({ minLength: 1, maxLength: 6 }),
  startMs: msLike,
  endMs: msLike,
});

const transcriptItem = fc.oneof(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    projectId: fc.constant("p1"),
    assetVersionId: fc.constant("av1"),
    startMs: msLike,
    endMs: msLike,
    text: fc.string({ maxLength: 12 }),
    words: fc.array(wordLike, { maxLength: 2 }),
  }),
  fc.anything(),
);

const observationItem = fc.oneof(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    projectId: fc.constant("p1"),
    assetVersionId: fc.constant("av1"),
    timestampMs: msLike,
    description: fc.string({ maxLength: 12 }),
    onScreenText: fc.array(fc.string({ maxLength: 6 }), { maxLength: 2 }),
  }),
  fc.anything(),
);

const isMs = (n: number): boolean => Number.isInteger(n) && n >= 0;

describe("validateTranscript properties", () => {
  it("keeps only segments with integer bounds 0 <= startMs <= endMs <= durationMs", () => {
    fc.assert(
      fc.property(fc.array(transcriptItem, { maxLength: 12 }), DURATION, (raw, durationMs) => {
        const { valid } = validateTranscript(raw, durationMs);
        for (const s of valid) {
          expect(isMs(s.startMs)).toBe(true);
          expect(isMs(s.endMs)).toBe(true);
          expect(s.startMs).toBeLessThanOrEqual(s.endMs);
          expect(s.endMs).toBeLessThanOrEqual(durationMs);
          expect(s.text.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("counts every dropped item exactly", () => {
    fc.assert(
      fc.property(fc.array(transcriptItem, { maxLength: 12 }), DURATION, (raw, durationMs) => {
        const { valid, rejectedCount } = validateTranscript(raw, durationMs);
        expect(valid.length + rejectedCount).toBe(raw.length);
        expect(rejectedCount).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("keeps a well formed segment that fits and drops one that ends after the video", () => {
    fc.assert(
      fc.property(
        DURATION,
        fc.integer({ min: 0, max: 180_000 }),
        fc.integer({ min: 0, max: 180_000 }),
        (durationMs, a, b) => {
          const startMs = Math.min(a, b);
          const endMs = Math.max(a, b);
          const item = {
            id: "t1",
            projectId: "p1",
            assetVersionId: "av1",
            startMs,
            endMs,
            text: "hello",
            words: [],
          };
          const { valid, rejectedCount } = validateTranscript([item], durationMs);
          const fits = endMs <= durationMs;
          expect(valid).toHaveLength(fits ? 1 : 0);
          expect(rejectedCount).toBe(fits ? 0 : 1);
        },
      ),
    );
  });

  it("keeps the order of the segments it keeps", () => {
    fc.assert(
      fc.property(fc.array(transcriptItem, { maxLength: 12 }), DURATION, (raw, durationMs) => {
        const { valid } = validateTranscript(raw, durationMs);
        const again = validateTranscript(valid, durationMs);
        expect(again.valid).toEqual(valid);
        expect(again.rejectedCount).toBe(0);
      }),
    );
  });
});

describe("validateObservations properties", () => {
  it("keeps only observations with an integer timestamp within 0..durationMs", () => {
    fc.assert(
      fc.property(fc.array(observationItem, { maxLength: 12 }), DURATION, (raw, durationMs) => {
        const { valid } = validateObservations(raw, durationMs);
        for (const o of valid) {
          expect(isMs(o.timestampMs)).toBe(true);
          expect(o.timestampMs).toBeLessThanOrEqual(durationMs);
          expect(o.description.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("counts every dropped item exactly", () => {
    fc.assert(
      fc.property(fc.array(observationItem, { maxLength: 12 }), DURATION, (raw, durationMs) => {
        const { valid, rejectedCount } = validateObservations(raw, durationMs);
        expect(valid.length + rejectedCount).toBe(raw.length);
      }),
    );
  });

  it("keeps a well formed observation that fits and drops one after the video", () => {
    fc.assert(
      fc.property(DURATION, fc.integer({ min: 0, max: 200_000 }), (durationMs, timestampMs) => {
        const item = {
          id: "f1",
          projectId: "p1",
          assetVersionId: "av1",
          timestampMs,
          description: "a screen",
          onScreenText: [],
        };
        const { valid, rejectedCount } = validateObservations([item], durationMs);
        const fits = timestampMs <= durationMs;
        expect(valid).toHaveLength(fits ? 1 : 0);
        expect(rejectedCount).toBe(fits ? 0 : 1);
      }),
    );
  });
});
