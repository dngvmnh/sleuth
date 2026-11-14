"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_VOLUME, NightWind } from "./night-wind";

/** Where the choice is kept: "on" or "off". */
export const NIGHT_WIND_KEY = "sleuth.nightWind";
/**
 * The workspace player announces itself with this window event (`detail` "play" or "pause"),
 * so the player and the ambience never import each other.
 */
export const MEDIA_EVENT = "sleuth:media";

/** off: silent. resume: on last time, waiting for one click. on: playing. */
export type NightWindStatus = "off" | "resume" | "on";

/** The part of `NightWind` the hook uses, so tests can pass their own. */
export type NightWindEngine = Pick<
  NightWind,
  "start" | "stop" | "duck" | "pageHidden" | "setVolume" | "dispose" | "isPlaying"
>;

// ---- the stored choice, as a tiny external store ----

const storeListeners = new Set<() => void>();

function readChoice(): "on" | "off" {
  try {
    return window.localStorage.getItem(NIGHT_WIND_KEY) === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

function writeChoice(choice: "on" | "off"): void {
  try {
    window.localStorage.setItem(NIGHT_WIND_KEY, choice);
  } catch {
    // Private mode or storage turned off: the choice lasts for this page only.
  }
  for (const listener of storeListeners) listener();
}

function subscribe(listener: () => void): () => void {
  storeListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === NIGHT_WIND_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    storeListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export interface NightWindControl {
  status: NightWindStatus;
  /** 0..1 */
  volume: number;
  /** Call from a click only: the first call creates the AudioContext. */
  toggle: () => void;
  setVolume: (volume: number) => void;
}

/**
 * Night wind state for the header toggle. Never makes a sound without a click: on a later
 * visit with "on" stored, the status is "resume" until the visitor clicks once.
 */
export function useNightWind(createEngine: () => NightWindEngine = () => new NightWind()): NightWindControl {
  // The server and the first client render both say "off"; the stored choice comes after.
  const stored = useSyncExternalStore(subscribe, readChoice, () => "off" as const);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const engine = useRef<NightWindEngine | null>(null);
  const mediaPlaying = useRef(false);
  const factory = useRef(createEngine);

  useEffect(() => {
    const onMedia = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail !== "play" && detail !== "pause") return;
      mediaPlaying.current = detail === "play";
      engine.current?.duck(mediaPlaying.current);
    };
    const onVisibility = () => engine.current?.pageHidden(document.visibilityState === "hidden");
    window.addEventListener(MEDIA_EVENT, onMedia);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(MEDIA_EVENT, onMedia);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(
    () => () => {
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );

  const toggle = useCallback(() => {
    if (engine.current?.isPlaying) {
      engine.current.stop();
      setPlaying(false);
      writeChoice("off");
      return;
    }
    try {
      engine.current ??= factory.current();
      engine.current.setVolume(volume);
      engine.current.duck(mediaPlaying.current);
      engine.current.start();
    } catch {
      // No Web Audio in this browser: stay silent and off.
      setPlaying(false);
      return;
    }
    setPlaying(true);
    writeChoice("on");
  }, [volume]);

  const setVolume = useCallback((next: number) => {
    setVolumeState(next);
    engine.current?.setVolume(next);
  }, []);

  const status: NightWindStatus = playing ? "on" : stored === "on" ? "resume" : "off";
  return { status, volume, toggle, setVolume };
}
