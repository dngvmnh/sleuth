"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { HtmlVideoPlayer } from "./html-player";
import type { PlayerPort } from "./player-port";

export interface VideoPlayerState {
  player: PlayerPort;
  currentMs: number;
  playing: boolean;
  durationMs: number;
}

interface Snapshot {
  currentMs: number;
  playing: boolean;
  durationMs: number;
}

const EMPTY: Snapshot = { currentMs: 0, playing: false, durationMs: 0 };

/**
 * Wraps a real `<video>` element as the workspace's player. Returns `null` until there is an
 * element. The same state shape as the simulated clock, so the timeline and the sentence list
 * cannot tell the two apart. The adapter's DOM listeners are removed on unmount.
 */
export function useVideoPlayer(video: HTMLVideoElement | null): VideoPlayerState | null {
  const player = useMemo(() => (video ? new HtmlVideoPlayer(video) : null), [video]);
  useEffect(() => () => player?.dispose(), [player]);

  const cache = useRef<Snapshot>(EMPTY);
  const subscribe = useCallback((onChange: () => void) => (player ? player.on(onChange) : () => undefined), [player]);
  const getSnapshot = useCallback((): Snapshot => {
    const next = player
      ? { currentMs: player.currentMs, playing: player.playing, durationMs: player.durationMs }
      : EMPTY;
    const prev = cache.current;
    if (prev.currentMs !== next.currentMs || prev.playing !== next.playing || prev.durationMs !== next.durationMs) {
      cache.current = next;
    }
    return cache.current;
  }, [player]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return player ? { player, ...snap } : null;
}