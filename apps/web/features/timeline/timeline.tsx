"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { LiveRegion } from "@/components/live-region";
import { msToPercent } from "./geometry";
import { describeMarker, formatSeconds, type TimelineMarker } from "./markers";
import { STATE_LABELS, type SegmentState } from "./state";

type MarkerState = TimelineMarker["state"];

const STATE_TEXT_CLASS: Record<MarkerState, string> = {
  covered: "text-ok",
  needs_review: "text-primary-strong",
  stale: "text-warn",
  outside_proof: "text-danger",
};

/** Shape carries the state, colour only helps: filled circle, hollow circle, dashed square, diamond. */
export function MarkerShape({ state }: { state: SegmentState }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true } as const;
  switch (state) {
    case "covered":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="currentColor" />
        </svg>
      );
    case "stale":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
        </svg>
      );
    case "outside_proof":
      return (
        <svg {...common}>
          <path d="M8 1 L15 8 L8 15 L1 8 Z" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}

const LEGEND: MarkerState[] = ["covered", "needs_review", "stale", "outside_proof"];

export interface TimelineProps {
  markers: readonly TimelineMarker[];
  durationMs: number;
  currentMs: number;
  selectedId: string | null;
  /** Called when the user activates a marker (Enter, Space or click). */
  onSelect: (marker: TimelineMarker) => void;
  /** Called on Escape: the workspace moves focus back to the sentence list. */
  onEscape: () => void;
}

/**
 * Evidence markers on a time axis. One toolbar, one tab stop: Left and Right move between
 * markers, Home and End jump to the ends, Enter or Space selects, Escape leaves.
 * Positions come from `geometry.ts` only. The playhead is decorative.
 */
export function Timeline({ markers, durationMs, currentMs, selectedId, onSelect, onEscape }: TimelineProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState("");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const count = markers.length;
  // The tab stop sits on the marker the user last moved to, else the selected one, else the first.
  const tabIndex = Math.min(Math.max(activeIndex, 0), Math.max(count - 1, 0));

  const moveTo = (index: number) => {
    setActiveIndex(index);
    buttons.current[index]?.focus();
    setMessage(`Marker ${index + 1} of ${count}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (count === 0) return;
    const current = buttons.current.findIndex((b) => b === document.activeElement);
    const from = current === -1 ? tabIndex : current;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = Math.min(from + 1, count - 1);
    else if (event.key === "ArrowLeft") next = Math.max(from - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  };

  const select = (marker: TimelineMarker, index: number) => {
    setActiveIndex(index);
    setMessage(`Selected: ${describeMarker(marker)}`);
    onSelect(marker);
  };

  return (
    <section aria-labelledby="timeline-heading" className="rounded-md border border-line bg-surface p-4">
      <h2 id="timeline-heading" className="font-display text-lg text-foreground">
        Timeline
      </h2>
      <p className="mt-1 text-sm text-muted">
        {count === 0
          ? "No evidence markers for this project."
          : "Use Left and Right to move between markers, Home and End to jump, Enter to select, Escape to go back to the script."}
      </p>

      <div className="mx-4 mt-4">
        <div
          role="toolbar"
          aria-label="Evidence markers"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="relative h-28 border-b border-line"
        >
          {markers.map((marker, index) => {
            const left = msToPercent(marker.startMs, durationMs);
            const width = Math.max(msToPercent(marker.endMs, durationMs) - left, 0.5);
            const selected = marker.id === selectedId;
            return (
              <div key={marker.id}>
                <div
                  aria-hidden="true"
                  // A border, not a background: contrast themes drop author backgrounds.
                  className={`absolute h-0 rounded-sm border-t-4 border-current opacity-60 ${STATE_TEXT_CLASS[marker.state]} ${
                    marker.state === "stale" ? "opacity-40" : ""
                  }`}
                  style={{ left: `${left}%`, width: `${width}%`, top: `${72 + (index % 2) * 8}px` }}
                />
                <button
                  type="button"
                  ref={(el) => {
                    buttons.current[index] = el;
                  }}
                  tabIndex={index === tabIndex ? 0 : -1}
                  aria-label={describeMarker(marker)}
                  aria-pressed={selected}
                  data-state={marker.state}
                  onClick={() => select(marker, index)}
                  onFocus={() => setActiveIndex(index)}
                  className={`absolute flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-md border ${
                    STATE_TEXT_CLASS[marker.state]
                  } ${
                    // In a contrast theme every marker gets the same system border, so the chosen
                    // one also gets a double border (shape, not colour).
                    selected
                      ? "border-current bg-raised forced-colors:border-[3px] forced-colors:border-double"
                      : "border-transparent"
                  }`}
                  style={{ left: `${left}%`, top: `${4 + (index % 2) * 34}px` }}
                >
                  <MarkerShape state={marker.state} />
                </button>
              </div>
            );
          })}
          <div
            aria-hidden="true"
            data-testid="playhead"
            className="absolute bottom-0 top-0 w-0 border-l border-foreground opacity-70"
            style={{ left: `${msToPercent(currentMs, durationMs)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden="true">
          <span>0 s</span>
          <span>{formatSeconds(durationMs)} s</span>
        </div>
      </div>

      <ul aria-label="Marker shapes" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        {LEGEND.map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span className={STATE_TEXT_CLASS[state as MarkerState]}>
              <MarkerShape state={state} />
            </span>
            {STATE_LABELS[state].name} ({STATE_LABELS[state].plain})
          </li>
        ))}
      </ul>

      <LiveRegion message={message} />
    </section>
  );
}
