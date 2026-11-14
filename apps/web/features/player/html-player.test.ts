import { describe, expect, it, vi } from "vitest";
import { HtmlVideoPlayer, type VideoElementLike } from "./html-player";
import type { PlayerChange } from "./player-port";

/** A stand-in for a `<video>`: no media is loaded and nothing leaves the process. */
class StubVideo implements VideoElementLike {
  currentTime = 0;
  duration = 10; // seconds
  paused = true;
  ended = false;
  playRejects = false;
  private handlers = new Map<string, Set<() => void>>();

  play(): Promise<void> {
    if (this.playRejects) return Promise.reject(new Error("autoplay blocked"));
    this.paused = false;
    this.fire("play");
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.fire("pause");
  }
  addEventListener(type: string, listener: () => void): void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(listener);
    this.handlers.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.handlers.get(type)?.delete(listener);
  }
  fire(type: string): void {
    for (const h of [...(this.handlers.get(type) ?? [])]) h();
  }
  listenerCount(): number {
    return [...this.handlers.values()].reduce((n, s) => n + s.size, 0);
  }
}

describe("HtmlVideoPlayer", () => {
  it("reads time and duration from the element as whole ms", () => {
    const video = new StubVideo();
    video.currentTime = 1.2346;
    const p = new HtmlVideoPlayer(video);
    expect(p.durationMs).toBe(10_000);
    expect(p.currentMs).toBe(1235);
    expect(p.playing).toBe(false);
  });

  it("reports a duration of 0 until the video has loaded", () => {
    for (const d of [Number.NaN, Number.POSITIVE_INFINITY, 0]) {
      const video = new StubVideo();
      video.duration = d;
      video.currentTime = 3;
      const p = new HtmlVideoPlayer(video);
      expect(p.durationMs).toBe(0);
      expect(p.currentMs).toBe(0);
    }
  });

  it("seeks by setting currentTime in seconds, held inside the duration", () => {
    const video = new StubVideo();
    const p = new HtmlVideoPlayer(video);
    p.seek(2500);
    expect(video.currentTime).toBe(2.5);
    p.seek(-1);
    expect(video.currentTime).toBe(0);
    p.seek(999_999);
    expect(video.currentTime).toBe(10);
  });

  it("plays and pauses through the element and reports playing", () => {
    const video = new StubVideo();
    const p = new HtmlVideoPlayer(video);
    const seen: PlayerChange[] = [];
    p.on((c) => seen.push(c));
    p.play();
    expect(p.playing).toBe(true);
    p.pause();
    expect(p.playing).toBe(false);
    expect(seen.map((c) => c.kind)).toEqual(["play", "pause"]);
  });

  it("does not play when there is no duration", () => {
    const video = new StubVideo();
    video.duration = Number.NaN;
    const play = vi.spyOn(video, "play");
    new HtmlVideoPlayer(video).play();
    expect(play).not.toHaveBeenCalled();
  });

  it("stays paused when the browser refuses to play", async () => {
    const video = new StubVideo();
    video.playRejects = true;
    const p = new HtmlVideoPlayer(video);
    const seen: PlayerChange[] = [];
    p.on((c) => seen.push(c));
    expect(() => p.play()).not.toThrow();
    await Promise.resolve();
    expect(p.playing).toBe(false);
    expect(seen).toEqual([]);
  });

  it("turns element events into changes with the current time", () => {
    const video = new StubVideo();
    const p = new HtmlVideoPlayer(video);
    const seen: PlayerChange[] = [];
    p.on((c) => seen.push(c));
    video.currentTime = 3;
    video.fire("timeupdate");
    video.currentTime = 4;
    video.fire("seeked");
    video.currentTime = 10;
    video.paused = true;
    video.ended = true;
    video.fire("ended");
    expect(seen).toEqual([
      { kind: "time", currentMs: 3000, playing: false },
      { kind: "seek", currentMs: 4000, playing: false },
      { kind: "ended", currentMs: 10_000, playing: false },
    ]);
  });

  it("stops notifying after unsubscribe", () => {
    const video = new StubVideo();
    const p = new HtmlVideoPlayer(video);
    const listener = vi.fn();
    const off = p.on(listener);
    video.fire("timeupdate");
    off();
    off();
    video.fire("timeupdate");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("removes every element listener on dispose and ignores later calls", () => {
    const video = new StubVideo();
    const p = new HtmlVideoPlayer(video);
    const listener = vi.fn();
    p.on(listener);
    expect(video.listenerCount()).toBeGreaterThan(0);
    p.dispose();
    p.dispose();
    expect(video.listenerCount()).toBe(0);
    video.fire("timeupdate");
    p.seek(1000);
    expect(listener).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
  });
});

describe("HtmlVideoPlayer media announcements (Night wind ducking)", () => {
  it("announces play once, then pause on pause, ended and dispose", async () => {
    const video = new StubVideo();
    const announce = vi.fn();
    const p = new HtmlVideoPlayer(video, announce);
    p.play();
    await Promise.resolve();
    video.fire("play");
    expect(announce.mock.calls).toEqual([["play"]]);
    p.pause();
    expect(announce.mock.calls).toEqual([["play"], ["pause"]]);
    p.play();
    await Promise.resolve();
    video.ended = true;
    video.fire("ended");
    expect(announce.mock.calls.at(-1)).toEqual(["pause"]);
    p.play();
    await Promise.resolve();
    p.dispose();
    expect(announce.mock.calls.at(-1)).toEqual(["pause"]);
  });

  it("announces nothing when the browser refuses to play", async () => {
    const video = new StubVideo();
    video.playRejects = true;
    const announce = vi.fn();
    const p = new HtmlVideoPlayer(video, announce);
    p.play();
    await Promise.resolve();
    p.dispose();
    expect(announce).not.toHaveBeenCalled();
  });

  it("the default announcer is safe outside a browser", () => {
    expect(() => new HtmlVideoPlayer(new StubVideo()).dispose()).not.toThrow();
  });
});
