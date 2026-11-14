"use client";

import { useId } from "react";
import { CrescentWindIcon } from "@/components/icons";
import { useNightWind, type NightWindEngine, type NightWindStatus } from "./use-night-wind";

export const NIGHT_WIND_LABELS: Record<NightWindStatus, string> = {
  off: "Night wind: off",
  on: "Night wind: on",
  resume: "Night wind: tap to resume",
};

/**
 * The header control for the ambient sound (WCAG 1.4.2: off by default, with a visible
 * control). The volume slider shows only while the sound is on.
 */
export function NightWindToggle({ createEngine }: { createEngine?: () => NightWindEngine }) {
  const { status, volume, toggle, setVolume } = useNightWind(createEngine);
  const sliderId = useId();
  const on = status === "on";
  return (
    <div className="flex items-center gap-2" data-print="hide">
      <button
        type="button"
        aria-pressed={on}
        onClick={toggle}
        data-status={status}
        className={`inline-flex min-h-8 min-w-6 items-center gap-1.5 rounded-[2px] border px-2 py-1 text-xs transition-colors hover:text-foreground ${
          on ? "border-line-strong text-primary" : "border-line text-muted"
        }`}
      >
        <CrescentWindIcon size={16} />
        <span>{NIGHT_WIND_LABELS[status]}</span>
      </button>
      {on ? (
        <>
          <label htmlFor={sliderId} className="sr-only">
            Night wind volume
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.currentTarget.value) / 100)}
            className="h-6 w-20 accent-primary"
          />
        </>
      ) : null}
    </div>
  );
}
