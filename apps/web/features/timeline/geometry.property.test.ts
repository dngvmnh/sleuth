import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clamp, msToPercent, percentToMs } from "./geometry";

// Durations up to the 180 second MVP limit, plus a wider range to stress the maths.
const durationArb = fc.integer({ min: 1, max: 3_600_000 });
const pairArb = durationArb.chain((d) => fc.tuple(fc.integer({ min: 0, max: d }), fc.constant(d)));

describe("msToPercent and percentToMs (requirement 4.5)", () => {
  it("returns to within 1 ms of the start time for every valid time", () => {
    fc.assert(
      fc.property(pairArb, ([t, d]) => {
        expect(Math.abs(percentToMs(msToPercent(t, d), d) - t)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 500 },
    );
  });

  it("keeps the position within 0 and 100 for any input", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000_000, max: 10_000_000 }), fc.integer({ min: -5, max: 3_600_000 }), (t, d) => {
        const p = msToPercent(t, d);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }),
      { numRuns: 500 },
    );
  });

  it("keeps the time within 0 and the duration for any percent", () => {
    fc.assert(
      fc.property(fc.double({ min: -500, max: 500, noNaN: true }), durationArb, (p, d) => {
        const ms = percentToMs(p, d);
        expect(Number.isInteger(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(0);
        expect(ms).toBeLessThanOrEqual(d);
      }),
      { numRuns: 500 },
    );
  });

  it("never moves left when the time moves right", () => {
    fc.assert(
      fc.property(
        durationArb.chain((d) => fc.tuple(fc.integer({ min: 0, max: d }), fc.integer({ min: 0, max: d }), fc.constant(d))),
        ([a, b, d]) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(msToPercent(lo, d)).toBeLessThanOrEqual(msToPercent(hi, d));
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("geometry boundaries", () => {
  it("maps the start to 0 and the end to 100", () => {
    expect(msToPercent(0, 180_000)).toBe(0);
    expect(msToPercent(180_000, 180_000)).toBe(100);
    expect(percentToMs(0, 180_000)).toBe(0);
    expect(percentToMs(100, 180_000)).toBe(180_000);
  });

  it("maps the middle to 50", () => {
    expect(msToPercent(90_000, 180_000)).toBe(50);
    expect(percentToMs(50, 180_000)).toBe(90_000);
  });

  it("clamps times outside the video to the ends", () => {
    expect(msToPercent(-1, 1000)).toBe(0);
    expect(msToPercent(1001, 1000)).toBe(100);
    expect(percentToMs(-5, 1000)).toBe(0);
    expect(percentToMs(105, 1000)).toBe(1000);
  });

  it("maps everything to the start when the duration is 0, negative or not a number", () => {
    for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(msToPercent(500, d)).toBe(0);
      expect(percentToMs(50, d)).toBe(0);
    }
  });

  it("treats a non-finite input as the start", () => {
    expect(msToPercent(Number.NaN, 1000)).toBe(0);
    expect(percentToMs(Number.NaN, 1000)).toBe(0);
    expect(clamp(Number.NaN, 2, 5)).toBe(2);
  });

  it("round-trips a 1 ms video exactly", () => {
    expect(percentToMs(msToPercent(1, 1), 1)).toBe(1);
    expect(percentToMs(msToPercent(0, 1), 1)).toBe(0);
  });
});
