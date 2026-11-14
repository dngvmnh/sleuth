import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_REFRESH_MS, REFRESH_MARGIN_MS, usePlaybackUrl } from "./use-playback-url";

const flush = () => act(async () => {});

describe("usePlaybackUrl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T00:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns null and asks nothing when there is no asset version", async () => {
    const fetchUrl = vi.fn();
    const { result } = renderHook(() => usePlaybackUrl(fetchUrl, undefined));
    await flush();
    expect(result.current).toBeNull();
    expect(fetchUrl).not.toHaveBeenCalled();
  });

  it("returns null for a null answer and does not ask again", async () => {
    const fetchUrl = vi.fn(async () => ({ url: null, expiresAt: null }));
    const { result } = renderHook(() => usePlaybackUrl(fetchUrl, "av1"));
    await flush();
    await act(async () => void (await vi.advanceTimersByTimeAsync(60 * 60_000)));
    expect(result.current).toBeNull();
    expect(fetchUrl).toHaveBeenCalledTimes(1);
  });

  it("asks again shortly before the URL expires, and uses the new one", async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const answers = [
      { url: "https://f.test/a", expiresAt },
      { url: "https://f.test/b", expiresAt: new Date(Date.now() + 20 * 60_000).toISOString() },
    ];
    const fetchUrl = vi.fn(async () => answers.shift() ?? { url: null, expiresAt: null });
    const { result } = renderHook(() => usePlaybackUrl(fetchUrl, "av1"));
    await flush();
    expect(result.current).toBe("https://f.test/a");
    await act(async () => void (await vi.advanceTimersByTimeAsync(5 * 60_000 - REFRESH_MARGIN_MS - 1)));
    expect(fetchUrl).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2)));
    expect(fetchUrl).toHaveBeenCalledTimes(2);
    expect(result.current).toBe("https://f.test/b");
  });

  it("never asks more often than the minimum, even for an expiry in the past", async () => {
    const fetchUrl = vi.fn(async () => ({ url: "https://f.test/a", expiresAt: "2020-01-01T00:00:00.000Z" }));
    renderHook(() => usePlaybackUrl(fetchUrl, "av1"));
    await flush();
    await act(async () => void (await vi.advanceTimersByTimeAsync(MIN_REFRESH_MS - 1)));
    expect(fetchUrl).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2)));
    expect(fetchUrl).toHaveBeenCalledTimes(2);
  });

  it("falls back to null when a request fails", async () => {
    const fetchUrl = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => usePlaybackUrl(fetchUrl, "av1"));
    await flush();
    expect(result.current).toBeNull();
  });

  it("stops asking after unmount", async () => {
    const fetchUrl = vi.fn(async () => ({ url: "https://f.test/a", expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    const { unmount } = renderHook(() => usePlaybackUrl(fetchUrl, "av1"));
    await flush();
    unmount();
    await act(async () => void (await vi.advanceTimersByTimeAsync(10 * 60_000)));
    expect(fetchUrl).toHaveBeenCalledTimes(1);
  });
});