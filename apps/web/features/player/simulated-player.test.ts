import { describe, expect, it, vi } from "vitest";
import { segmentAtMs } from "../timeline/segment-at";
import type { PlayerChange } from "./player-port";
import { SimulatedPlayer } from "./simulated-player";

function record(player: SimulatedPlayer): PlayerChange[] {
  const seen: PlayerChange[] = [];
  player.on((c) => seen.push(c));
  return seen;
}

describe("SimulatedPlayer", () => {
  it("starts paused at 0 with the given duration", () => {
    const p = new SimulatedPlayer(10_000);
    expect(p.currentMs).toBe(0);
    expect(p.durationMs).toBe(10_000);
    expect(p.playing).toBe(false);
  });

  it("moves time only while playing", () => {
    const p = new SimulatedPlayer(10_000);
    p.play();
    p.tick(1500);
    expect(p.currentMs).toBe(1500);
    p.pause();
    p.tick(1500);
    expect(p.currentMs).toBe(1500);
  });

  it("does not move on a tick before play or after pause", () => {
    const p = new SimulatedPlayer(10_000);
    const seen = record(p);
    p.tick(500);
    expect(p.currentMs).toBe(0);
    expect(seen).toEqual([]);
  });

  it("emits play and pause once per real change", () => {
    const p = new SimulatedPlayer(10_000);
    const seen = record(p);
    p.play();
    p.play();
    p.pause();
    p.pause();
    expect(seen.map((c) => c.kind)).toEqual(["play", "pause"]);
    expect(seen[0]).toEqual({ kind: "play", currentMs: 0, playing: true });
    expect(seen[1]).toEqual({ kind: "pause", currentMs: 0, playing: false });
  });

  it("seeks to a time and emits a seek with the new time", () => {
    const p = new SimulatedPlayer(10_000);
    const seen = record(p);
    p.seek(4200);
    expect(p.currentMs).toBe(4200);
    expect(seen).toEqual([{ kind: "seek", currentMs: 4200, playing: false }]);
  });

  it("holds a seek inside 0..duration", () => {
    const p = new SimulatedPlayer(10_000);
    p.seek(-500);
    expect(p.currentMs).toBe(0);
    p.seek(99_999);
    expect(p.currentMs).toBe(10_000);
    p.seek(Number.NaN);
    expect(p.currentMs).toBe(0);
  });

  it("rounds a seek to whole ms", () => {
    const p = new SimulatedPlayer(10_000);
    p.seek(1234.6);
    expect(p.currentMs).toBe(1235);
  });

  it("keeps playing after a seek in the middle", () => {
    const p = new SimulatedPlayer(10_000);
    p.play();
    p.seek(2000);
    expect(p.playing).toBe(true);
    p.tick(500);
    expect(p.currentMs).toBe(2500);
  });

  it("stops at exactly the duration and emits ended when a tick reaches the end", () => {
    const p = new SimulatedPlayer(1000);
    const seen = record(p);
    p.play();
    p.tick(5000);
    expect(p.currentMs).toBe(1000);
    expect(p.playing).toBe(false);
    expect(seen.map((c) => c.kind)).toEqual(["play", "time", "ended"]);
    expect(seen.at(-1)).toEqual({ kind: "ended", currentMs: 1000, playing: false });
  });

  it("ends when a seek to the end happens during playback", () => {
    const p = new SimulatedPlayer(1000);
    const seen = record(p);
    p.play();
    p.seek(1000);
    expect(p.playing).toBe(false);
    expect(seen.map((c) => c.kind)).toEqual(["play", "seek", "ended"]);
  });

  it("restarts from 0 when played at the end", () => {
    const p = new SimulatedPlayer(1000);
    p.play();
    p.tick(1000);
    p.play();
    expect(p.currentMs).toBe(0);
    expect(p.playing).toBe(true);
  });

  it("ignores zero, negative and non-finite ticks", () => {
    const p = new SimulatedPlayer(10_000);
    p.play();
    for (const d of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) p.tick(d);
    expect(p.currentMs).toBe(0);
  });

  it("cannot play when the duration is 0", () => {
    for (const d of [0, -5, Number.NaN]) {
      const p = new SimulatedPlayer(d);
      const seen = record(p);
      p.play();
      expect(p.durationMs).toBe(0);
      expect(p.playing).toBe(false);
      expect(seen).toEqual([]);
    }
  });

  it("drives the same time rules as the timeline helpers", () => {
    const segments = [
      { id: "a", startMs: 0, endMs: 1000 },
      { id: "b", startMs: 1000, endMs: 2000 },
    ];
    const p = new SimulatedPlayer(2000);
    p.seek(999);
    expect(segmentAtMs(segments, p.currentMs)?.id).toBe("a");
    p.seek(1000);
    expect(segmentAtMs(segments, p.currentMs)?.id).toBe("b");
    p.seek(2000);
    expect(segmentAtMs(segments, p.currentMs)).toBeUndefined();
  });

  describe("subscriptions", () => {
    it("notifies every listener and stops after unsubscribe", () => {
      const p = new SimulatedPlayer(10_000);
      const a = vi.fn();
      const b = vi.fn();
      const offA = p.on(a);
      p.on(b);
      p.seek(100);
      offA();
      p.seek(200);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(2);
    });

    it("allows unsubscribe to be called twice", () => {
      const p = new SimulatedPlayer(10_000);
      const off = p.on(vi.fn());
      off();
      expect(() => off()).not.toThrow();
    });

    it("lets a listener unsubscribe itself while being notified", () => {
      const p = new SimulatedPlayer(10_000);
      const other = vi.fn();
      const off = p.on(() => off());
      p.on(other);
      p.seek(100);
      p.seek(200);
      expect(other).toHaveBeenCalledTimes(2);
    });

    it("stops everything after dispose", () => {
      const p = new SimulatedPlayer(10_000);
      const listener = vi.fn();
      p.on(listener);
      p.play();
      p.dispose();
      listener.mockClear();
      p.play();
      p.seek(500);
      p.tick(500);
      p.pause();
      expect(listener).not.toHaveBeenCalled();
      expect(p.playing).toBe(false);
      expect(() => p.on(listener)()).not.toThrow();
    });
  });
});
