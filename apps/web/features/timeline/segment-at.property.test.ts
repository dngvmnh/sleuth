import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { segmentAtMs } from "./segment-at";

interface Seg {
  id: number;
  startMs: number;
  endMs: number;
}

/**
 * Non-overlapping intervals in order, with random gaps (possibly 0, so some touch)
 * and non-zero lengths. Also returns the total span.
 */
const layoutArb = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 1, max: 5000 })), { maxLength: 12 })
  .map((parts) => {
    let cursor = 0;
    const segs: Seg[] = parts.map(([gap, len], id) => {
      const startMs = cursor + gap;
      const endMs = startMs + len;
      cursor = endMs;
      return { id, startMs, endMs };
    });
    return { segs, span: cursor };
  });

describe("segmentAtMs (requirement 4.4)", () => {
  it("returns exactly the interval that contains the time", () => {
    fc.assert(
      fc.property(layoutArb, fc.nat(), ({ segs, span }, seed) => {
        const ms = span === 0 ? 0 : seed % (span + 1);
        const expected = segs.filter((s) => s.startMs <= ms && ms < s.endMs);
        expect(expected.length).toBeLessThanOrEqual(1);
        expect(segmentAtMs(segs, ms)).toBe(expected[0]);
      }),
      { numRuns: 500 },
    );
  });

  it("returns nothing for a time in a gap, before the first or after the last interval", () => {
    fc.assert(
      fc.property(layoutArb, fc.integer({ min: -10_000, max: 200_000 }), ({ segs }, ms) => {
        const inside = segs.some((s) => s.startMs <= ms && ms < s.endMs);
        if (!inside) expect(segmentAtMs(segs, ms)).toBeUndefined();
      }),
      { numRuns: 500 },
    );
  });

  it("returns the interval for every time inside it, including its first ms and last ms", () => {
    fc.assert(
      fc.property(layoutArb, ({ segs }) => {
        for (const s of segs) {
          expect(segmentAtMs(segs, s.startMs)).toBe(s);
          expect(segmentAtMs(segs, s.endMs - 1)).toBe(s);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("does not depend on the order of the list", () => {
    fc.assert(
      fc.property(layoutArb, fc.nat(), ({ segs, span }, seed) => {
        const ms = span === 0 ? 0 : seed % (span + 1);
        expect(segmentAtMs([...segs].reverse(), ms)).toBe(segmentAtMs(segs, ms));
      }),
      { numRuns: 300 },
    );
  });
});

describe("segmentAtMs boundaries", () => {
  const a: Seg = { id: 1, startMs: 0, endMs: 1000 };
  const b: Seg = { id: 2, startMs: 1000, endMs: 2000 };
  const c: Seg = { id: 3, startMs: 3000, endMs: 4000 };

  it("gives the shared instant of two touching intervals to the later one only", () => {
    expect(segmentAtMs([a, b], 999)).toBe(a);
    expect(segmentAtMs([a, b], 1000)).toBe(b);
    expect(segmentAtMs([b, a], 1000)).toBe(b);
  });

  it("includes the start and excludes the end of an interval", () => {
    expect(segmentAtMs([c], 3000)).toBe(c);
    expect(segmentAtMs([c], 3999)).toBe(c);
    expect(segmentAtMs([c], 4000)).toBeUndefined();
    expect(segmentAtMs([c], 2999)).toBeUndefined();
  });

  it("returns nothing in the gap between intervals", () => {
    expect(segmentAtMs([a, b, c], 2000)).toBeUndefined();
    expect(segmentAtMs([a, b, c], 2500)).toBeUndefined();
  });

  it("returns nothing for an empty list, before the first and after the last interval", () => {
    expect(segmentAtMs([], 0)).toBeUndefined();
    expect(segmentAtMs([a], -1)).toBeUndefined();
    expect(segmentAtMs([a, b, c], 5000)).toBeUndefined();
  });

  it("never returns an empty interval", () => {
    const empty: Seg = { id: 9, startMs: 500, endMs: 500 };
    expect(segmentAtMs([empty], 500)).toBeUndefined();
    expect(segmentAtMs([empty, a], 500)).toBe(a);
  });

  it("returns nothing for a time that is not a number", () => {
    expect(segmentAtMs([a], Number.NaN)).toBeUndefined();
    expect(segmentAtMs([a], Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
