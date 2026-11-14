"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckIcon } from "@/components/icons";

/** idle: nothing saved on this page yet, so nothing is shown. */
export type SaveState = "idle" | "saving" | "saved" | "failed";

interface SaveStatusValue {
  state: SaveState;
  /** Goes up by one after each successful save, so other parts (the open-findings chip) can recount. */
  savedCount: number;
  /**
   * Report one save (script, checklist or review decision). Returns the same promise, so a
   * caller can wrap its API call without changing its result or its error.
   */
  track: <T>(save: Promise<T>) => Promise<T>;
  /** Back to idle, for example after moving to another page. */
  reset: () => void;
}

// Without a provider (unit tests, isolated components) saves still work; nothing is shown.
const fallback: SaveStatusValue = { state: "idle", savedCount: 0, track: (save) => save, reset: () => undefined };
const SaveStatusContext = createContext<SaveStatusValue>(fallback);

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SaveState>("idle");
  const [savedCount, setSavedCount] = useState(0);
  const inFlight = useRef(0);
  // A save that started before a reset must not report into the next page.
  const generation = useRef(0);

  const track = useCallback(<T,>(save: Promise<T>): Promise<T> => {
    const mine = generation.current;
    inFlight.current += 1;
    setState("saving");
    const settle = (next: SaveState) => {
      if (mine !== generation.current) return;
      inFlight.current = Math.max(0, inFlight.current - 1);
      if (next === "saved") setSavedCount((n) => n + 1);
      // While another save is still running, keep showing "Saving…".
      if (inFlight.current === 0) setState(next);
      else if (next === "failed") setState("failed");
    };
    save.then(
      () => settle("saved"),
      () => settle("failed"),
    );
    return save;
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    inFlight.current = 0;
    setState("idle");
  }, []);

  const value = useMemo(() => ({ state, savedCount, track, reset }), [state, savedCount, track, reset]);
  return <SaveStatusContext.Provider value={value}>{children}</SaveStatusContext.Provider>;
}

export function useSaveStatus(): SaveStatusValue {
  return useContext(SaveStatusContext);
}

/** The footer indicator. Says only what really happened; empty until something is saved. */
export function SaveStatusIndicator() {
  const { state } = useSaveStatus();
  return (
    <p role="status" aria-live="polite" className="flex min-h-6 items-center gap-1.5 text-xs" data-testid="save-status">
      {state === "saving" ? <span className="text-muted">Saving…</span> : null}
      {state === "saved" ? (
        <span className="inline-flex items-center gap-1.5 text-ok">
          <CheckIcon size={14} />
          Saved
        </span>
      ) : null}
      {state === "failed" ? <span className="text-danger">Not saved, see the message on the page</span> : null}
    </p>
  );
}
