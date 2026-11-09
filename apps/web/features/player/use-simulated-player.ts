"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PlayerPort } from "./player-port";
import { SimulatedPlayer } from "./simulated-player";

/** How often the simulated clock advances, in ms of simulated time per real tick. */
export const CLOCK_STEP_MS = 100;

export interface SimulatedPlayerState {
  /** The one player the whole workspace shares. */
  player: PlayerPort;
  currentMs: number;
  playing: boolean;
  durationMs: number;
}

interface Snapshot {
  currentMs: number;
  playing: boolean;
}

/**
 * Creates the workspace's single simulated player and drives its clock.
 * The display reads the player through `useSyncExternalStore`, so a seek made before any
 * effect has run is never missed. One interval runs only while playing; it and the
 * subscriptions are released on unmount, and re-rendering never starts another timer.
 * Mount with a `key` of the duration so a different duration gets a fresh player.
 */
export function useSimulatedPlayer(durationMs: number): SimulatedPlayerState {
  const [player] = useState(() => new SimulatedPlayer(durationMs));
  // Cache the snapshot so React sees the same object until the time or play state changes.
  const cache = useRef<Snapshot>({ currentMs: player.currentMs, playing: player.playing });

  const subscribe = useCallback((onChange: () => void) => player.on(onChange), [player]);
  const getSnapshot = useCallback((): Snapshot => {
    const prev = cache.current;
    if (prev.currentMs !== player.currentMs || prev.playing !== player.playing) {
      cache.current = { currentMs: player.currentMs, playing: player.playing };
    }
    return cache.current;
  }, [player]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const sync = (playing: boolean) => {
      if (playing && timer === undefined) {
        timer = setInterval(() => player.tick(CLOCK_STEP_MS), CLOCK_STEP_MS);
      } else if (!playing) {
        stop();
      }
    };
    const unsubscribe = player.on((change) => sync(change.playing));
    // Play may have been pressed before this effect ran.
    sync(player.playing);
    return () => {
      stop();
      unsubscribe();
      // The player keeps no timers of its own; stopping playback is all it needs.
      player.pause();
    };
  }, [player]);

  return { player, currentMs: snap.currentMs, playing: snap.playing, durationMs: player.durationMs };
}
