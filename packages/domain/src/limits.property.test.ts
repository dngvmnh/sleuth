import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkLimits, nextUtcDayMs, startOfUtcDayMs } from "./limits";

const configArb = fc.record({
  maxVideoMs: fc.integer({ min: 0, max: 600_000 }),
  dailyAnalysisLimit: fc.integer({ min: 0, max: 50 }),
});

describe("checkLimits properties", () => {
  it("accepts every integer duration from 0 to the maximum", () => {
    fc.assert(
      fc.property(configArb, fc.nat(), (config, n) => {
        const durationMs = n % (config.maxVideoMs + 1);
        expect(checkLimits({ durationMs, config })).toEqual({ ok: true });
      }),
    );
  });

  it("refuses every duration above the maximum", () => {
    fc.assert(
      fc.property(configArb, fc.integer({ min: 1, max: 10_000_000 }), (config, extra) => {
        const r = checkLimits({ durationMs: config.maxVideoMs + extra, config });
        expect(r).toEqual({ ok: false, code: "video_too_long" });
      }),
    );
  });

  it("refuses every negative or fractional duration", () => {
    fc.assert(
      fc.property(
        configArb,
        fc.oneof(
          fc.integer({ min: -10_000_000, max: -1 }),
          fc.double({ min: 0, max: 1_000_000, noInteger: true, noNaN: true }),
          fc.constant(Number.NaN),
        ),
        (config, durationMs) => {
          expect(checkLimits({ durationMs, config }).ok).toBe(false);
        },
      ),
    );
  });

  it("accepts a size exactly when it is a positive integer within the cap", () => {
    fc.assert(
      fc.property(
        configArb,
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: -5, max: 1_000_000_000 }),
        (config, cap, sizeBytes) => {
          const r = checkLimits({ sizeBytes, config: { ...config, maxVideoBytes: cap } });
          expect(r.ok).toBe(sizeBytes > 0 && sizeBytes <= cap);
        },
      ),
    );
  });

  it("allows exactly the first N requests of the day and refuses the rest", () => {
    fc.assert(
      fc.property(configArb, fc.integer({ min: 0, max: 200 }), (config, analysesToday) => {
        expect(checkLimits({ analysesToday, config }).ok).toBe(
          analysesToday < config.dailyAnalysisLimit,
        );
      }),
    );
  });

  it("never lets a simulated stream of requests exceed the daily limit", () => {
    fc.assert(
      fc.property(configArb, fc.integer({ min: 0, max: 300 }), (config, attempts) => {
        let accepted = 0;
        for (let i = 0; i < attempts; i++) {
          if (checkLimits({ analysesToday: accepted, config }).ok) accepted += 1;
        }
        expect(accepted).toBeLessThanOrEqual(config.dailyAnalysisLimit);
        expect(accepted).toBe(Math.min(attempts, config.dailyAnalysisLimit));
      }),
    );
  });

  it("resets on the next UTC midnight, always within the next 24 hours", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_102_444_800_000 }), (now) => {
        const reset = nextUtcDayMs(now);
        expect(reset).toBeGreaterThan(now);
        expect(reset - now).toBeLessThanOrEqual(86_400_000);
        expect(reset % 86_400_000).toBe(0);
        expect(startOfUtcDayMs(now)).toBeLessThanOrEqual(now);
      }),
    );
  });
});
