import { describe, expect, it } from "vitest";
import { checkLimits, nextUtcDayMs, startOfUtcDayMs } from "./limits";

const config = { maxVideoMs: 180_000, dailyAnalysisLimit: 5 };

describe("checkLimits: duration", () => {
  it.each([0, 1, 179_999, 180_000])("accepts %i ms", (durationMs) => {
    expect(checkLimits({ durationMs, config })).toEqual({ ok: true });
  });

  it("refuses a video one millisecond over the limit", () => {
    expect(checkLimits({ durationMs: 180_001, config })).toEqual({
      ok: false,
      code: "video_too_long",
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s as an invalid duration",
    (durationMs) => {
      const r = checkLimits({ durationMs, config });
      expect(r.ok).toBe(false);
    },
  );

  it("calls a negative or fractional duration invalid, not too long", () => {
    expect(checkLimits({ durationMs: -5, config })).toEqual({
      ok: false,
      code: "invalid_duration",
    });
    expect(checkLimits({ durationMs: 10.5, config })).toEqual({
      ok: false,
      code: "invalid_duration",
    });
  });
});

describe("checkLimits: daily analyses", () => {
  it("allows requests while under the limit", () => {
    expect(checkLimits({ analysesToday: 0, config })).toEqual({ ok: true });
    expect(checkLimits({ analysesToday: 4, config })).toEqual({ ok: true });
  });

  it("refuses the request that would be over the limit", () => {
    expect(checkLimits({ analysesToday: 5, config })).toEqual({
      ok: false,
      code: "limit_exceeded",
    });
    expect(checkLimits({ analysesToday: 99, config })).toEqual({
      ok: false,
      code: "limit_exceeded",
    });
  });

  it("checks duration before the daily count", () => {
    expect(checkLimits({ durationMs: 999_999, analysesToday: 99, config })).toEqual({
      ok: false,
      code: "video_too_long",
    });
  });

  it("checks nothing when no field is given", () => {
    expect(checkLimits({ config })).toEqual({ ok: true });
  });
});

describe("UTC day helpers", () => {
  const noon = Date.UTC(2026, 10, 8, 12, 30);
  it("finds the start and the reset of the UTC day", () => {
    expect(startOfUtcDayMs(noon)).toBe(Date.UTC(2026, 10, 8));
    expect(nextUtcDayMs(noon)).toBe(Date.UTC(2026, 10, 9));
  });
  it("treats midnight as the start of its own day", () => {
    expect(startOfUtcDayMs(Date.UTC(2026, 10, 8))).toBe(Date.UTC(2026, 10, 8));
    expect(nextUtcDayMs(Date.UTC(2026, 10, 8))).toBe(Date.UTC(2026, 10, 9));
  });
});
