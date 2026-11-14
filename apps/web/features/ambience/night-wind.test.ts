import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeAudioContext,
  FakeBufferSource,
  FakeConvolver,
  FakeFilter,
  FakeOscillator,
  fakeContextFactory,
} from "./fake-audio-context";
import { DUCK_S, FADE_IN_S, FADE_OUT_S, HOWL_MAX_MS, HOWL_MIN_MS, NIGHT_WIND_MAX_GAIN, NightWind } from "./night-wind";

function setup(random = () => 0.5) {
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const engine = new NightWind({
    createContext: fakeContextFactory(),
    random,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (id) => {
      (id as unknown as { cleared: boolean }).cleared = true;
    },
  });
  const ctx = () => FakeAudioContext.created.at(-1) as FakeAudioContext;
  const live = () => timers.filter((t) => !t.cleared);
  return { engine, ctx, timers, live };
}

beforeEach(() => {
  FakeAudioContext.created = [];
});

describe("NightWind engine", () => {
  it("creates no AudioContext until start()", () => {
    const { engine } = setup();
    engine.setVolume(0.5);
    engine.duck(true);
    engine.pageHidden(false);
    expect(FakeAudioContext.created).toHaveLength(0);
    expect(engine.hasContext).toBe(false);
  });

  it("builds the wind, hiss, drone and reverb from generated sound only", () => {
    const { engine, ctx } = setup();
    engine.start();
    const c = ctx();
    const filters = c.of(FakeFilter);
    const band = filters.find((f) => f.type === "bandpass");
    expect(band?.Q.value).toBeCloseTo(0.8);
    expect(filters.find((f) => f.type === "highpass")?.frequency.value).toBe(2500);

    // The LFO is 0.05..0.12 Hz and swings the band centre 575 +/- 325 Hz (250..900 Hz).
    const oscillators = c.of(FakeOscillator);
    const lfo = oscillators.find((o) => o.frequency.value < 1);
    expect(lfo?.frequency.value).toBeGreaterThanOrEqual(0.05);
    expect(lfo?.frequency.value).toBeLessThanOrEqual(0.12);
    expect(band?.frequency.value).toBe(575);
    expect(oscillators.map((o) => o.frequency.value)).toEqual(expect.arrayContaining([55, 55.4]));

    // Two looped noise beds; the brown one is 4 s long.
    const loops = c.of(FakeBufferSource);
    expect(loops.every((l) => l.loop && l.started)).toBe(true);
    expect(loops.map((l) => l.buffer?.duration)).toContain(4);

    // Reverb impulse: stereo, 2.5..3.5 s.
    const convolver = c.of(FakeConvolver)[0];
    expect(convolver?.buffer?.numberOfChannels).toBe(2);
    expect(convolver?.buffer?.duration).toBeGreaterThanOrEqual(2.5);
    expect(convolver?.buffer?.duration).toBeLessThanOrEqual(3.5);
  });

  it("fades in over 2 s to a gain capped at 0.18, through a compressor", () => {
    const { engine, ctx } = setup();
    engine.setVolume(5);
    engine.start();
    const master = ctx().master();
    expect(master.gain.lastRamp()).toEqual({ value: NIGHT_WIND_MAX_GAIN, at: FADE_IN_S });
    expect(ctx().resumeCalls).toBe(1);
  });

  it("fades out over 0.6 s, then suspends", () => {
    const { engine, ctx, live } = setup();
    engine.start();
    engine.stop();
    expect(ctx().master().gain.lastRamp()).toEqual({ value: 0, at: FADE_OUT_S });
    const suspend = live().find((t) => t.ms < 1000);
    suspend?.fn();
    expect(ctx().state).toBe("suspended");
    expect(engine.isPlaying).toBe(false);
  });

  it("ducks to 0 within 300 ms for the video and comes back after", () => {
    const { engine, ctx } = setup();
    engine.start();
    engine.duck(true);
    const ramp = ctx().master().gain.lastRamp();
    expect(ramp?.value).toBe(0);
    expect(DUCK_S).toBeLessThanOrEqual(0.3);
    expect(ramp?.at).toBe(DUCK_S);
    engine.duck(false);
    expect(ctx().master().gain.lastRamp()?.value).toBeCloseTo(0.6 * NIGHT_WIND_MAX_GAIN);
  });

  it("starts silent if the video is already playing", () => {
    const { engine, ctx } = setup();
    engine.duck(true);
    engine.start();
    expect(ctx().master().gain.lastRamp()?.value).toBe(0);
  });

  it("suspends when the tab is hidden and resumes only if it is on", () => {
    const { engine, ctx } = setup();
    engine.start();
    engine.pageHidden(true);
    expect(ctx().state).toBe("suspended");
    engine.pageHidden(false);
    expect(ctx().state).toBe("running");
    engine.stop();
    engine.pageHidden(true);
    engine.pageHidden(false);
    expect(ctx().state).toBe("suspended");
  });

  it("schedules a howl every 18 to 45 s that glides 330 -> 520 -> 280 Hz under a 1.2 kHz lowpass", () => {
    for (const r of [0, 0.999]) {
      FakeAudioContext.created = [];
      const { engine, live } = setup(() => r);
      engine.start();
      const next = live().at(-1);
      expect(next?.ms).toBeGreaterThanOrEqual(HOWL_MIN_MS);
      expect(next?.ms).toBeLessThanOrEqual(HOWL_MAX_MS);
      engine.dispose();
    }

    const { engine, ctx, live } = setup();
    engine.start();
    const before = ctx().of(FakeOscillator).length;
    live().at(-1)?.fn();
    const added = ctx().of(FakeOscillator).slice(before);
    expect(added.map((o) => o.type).sort()).toEqual(["sine", "sine", "triangle"]);
    const voice = added.find((o) => o.type === "triangle") as FakeOscillator;
    expect(voice.detune.value).not.toBe(0);
    expect(voice.frequency.calls[0]).toEqual({ method: "setValueAtTime", args: [330, 0] });
    const targets = voice.frequency.calls.filter((c) => c.method === "setTargetAtTime").map((c) => c.args[0]);
    expect(targets).toEqual([520, 280]);
    const vibrato = added.find((o) => o.frequency.value === 5);
    expect(vibrato).toBeDefined();
    expect(ctx().of(FakeFilter).some((f) => f.type === "lowpass" && f.frequency.value === 1200)).toBe(true);
    // The next howl is queued again.
    expect(live().length).toBeGreaterThan(0);
  });

  it("stops howling when stopped and closes the context on dispose", () => {
    const { engine, ctx, timers } = setup();
    engine.start();
    engine.stop();
    expect(timers.filter((t) => t.ms >= HOWL_MIN_MS).every((t) => t.cleared)).toBe(true);
    const close = vi.spyOn(ctx(), "close");
    engine.dispose();
    expect(close).toHaveBeenCalledOnce();
    expect(engine.hasContext).toBe(false);
  });
});
