import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planFrames } from "./frames";

const MAX_MS = 180_000;
const durationArb = fc.integer({ min: 0, max: MAX_MS });
const budgetArb = fc.integer({ min: 1, max: 120 });
const intervalArb = fc.integer({ min: 1, max: 30_000 });

describe("planFrames properties", () => {
  it("never plans more frames than the budget", () => {
    fc.assert(
      fc.property(durationArb, budgetArb, intervalArb, (durationMs, maxFrames, intervalMs) => {
        expect(planFrames(durationMs, { intervalMs, maxFrames }).length).toBeLessThanOrEqual(
          maxFrames,
        );
      }),
    );
  });

  it("starts at 0 and never goes past the end", () => {
    fc.assert(
      fc.property(durationArb, budgetArb, intervalArb, (durationMs, maxFrames, intervalMs) => {
        const plan = planFrames(durationMs, { intervalMs, maxFrames });
        expect(plan[0]).toBe(0);
        expect(plan[plan.length - 1]).toBeLessThanOrEqual(durationMs);
      }),
    );
  });

  it("plans whole, strictly rising milliseconds", () => {
    fc.assert(
      fc.property(durationArb, budgetArb, intervalArb, (durationMs, maxFrames, intervalMs) => {
        const plan = planFrames(durationMs, { intervalMs, maxFrames });
        for (const t of plan) expect(Number.isInteger(t) && t >= 0).toBe(true);
        for (let i = 1; i < plan.length; i += 1) expect(plan[i]).toBeGreaterThan(plan[i - 1] ?? -1);
      }),
    );
  });

  it("covers the whole video when the budget allows it", () => {
    fc.assert(
      fc.property(durationArb, budgetArb, intervalArb, (durationMs, maxFrames, intervalMs) => {
        const plan = planFrames(durationMs, { intervalMs, maxFrames });
        const step = Math.max(intervalMs, Math.ceil(durationMs / maxFrames));
        const last = plan[plan.length - 1] ?? 0;
        // The last planned frame is less than one step before the end, so no stretch is skipped.
        expect(durationMs - last).toBeLessThan(step + 1);
      }),
    );
  });

  it("returns nothing for impossible options", () => {
    expect(planFrames(-1, { intervalMs: 1000, maxFrames: 5 })).toEqual([]);
    expect(planFrames(1000, { intervalMs: 1000, maxFrames: 0 })).toEqual([]);
    expect(planFrames(1000, { intervalMs: 0, maxFrames: 5 })).toEqual([]);
  });
});
