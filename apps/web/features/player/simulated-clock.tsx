"use client";

import { Button } from "@/components/ui/button";
import { CLOCK_STEP_MS, type SimulatedPlayerState } from "./use-simulated-player";

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/**
 * Play, pause and a draggable position for the simulated clock. This moves a number, not a
 * video: it exists so the timeline and sentence list can be tried without footage.
 * It only shows and drives the shared player it is given; it owns no timer.
 */
export function SimulatedClock({ clock }: { clock: SimulatedPlayerState }) {
  const { player, currentMs, playing, durationMs } = clock;
  const empty = durationMs === 0;

  return (
    <div className="mt-4 rounded-md border border-line bg-surface p-4">
      <p className="text-sm font-medium text-foreground">Simulated clock (not video)</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          disabled={empty}
          onClick={() => (playing ? player.pause() : player.play())}
        >
          {playing ? "Pause simulated clock" : "Play simulated clock"}
        </Button>
        <label className="flex min-w-48 flex-1 items-center gap-3 text-sm text-muted">
          <span className="whitespace-nowrap">Clock position</span>
          <input
            type="range"
            className="w-full"
            min={0}
            max={durationMs}
            step={CLOCK_STEP_MS}
            value={currentMs}
            disabled={empty}
            aria-valuetext={`${seconds(currentMs)} of ${seconds(durationMs)} seconds`}
            onChange={(e) => player.seek(Number(e.currentTarget.value))}
          />
        </label>
        <p className="text-sm text-muted" aria-live="off">
          {seconds(currentMs)} s of {seconds(durationMs)} s
        </p>
      </div>
    </div>
  );
}
