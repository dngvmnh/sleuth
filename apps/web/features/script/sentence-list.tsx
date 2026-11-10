"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import type { ScriptSegment } from "@sleuth/contracts";
import { STATE_LABELS, type SegmentState } from "../timeline/state";
import { MarkerShape } from "../timeline/timeline";

export interface SentenceListHandle {
  /** Scroll the sentence into view and move keyboard focus to it. */
  focusSegment: (segmentId: string) => void;
}

export interface SentenceListProps {
  segments: readonly ScriptSegment[];
  states: Readonly<Record<string, SegmentState>>;
  /** The line the user picked (by clicking it or its marker). */
  selectedSegmentId: string | null;
  /** The line whose evidence interval holds the current time, while playing. */
  playingSegmentId: string | null;
  onSelect: (segmentId: string) => void;
}

/**
 * Numbered script lines. Each line is a button: choosing it selects the line and, when it has
 * evidence, the workspace seeks the clock. The badge shows the line's state with its
 * plain-English name; an empty line gets the Ghost badge.
 */
export const SentenceList = forwardRef<SentenceListHandle, SentenceListProps>(function SentenceList(
  { segments, states, selectedSegmentId, playingSegmentId, onSelect },
  ref,
) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useImperativeHandle(ref, () => ({
    focusSegment(segmentId) {
      const button = buttons.current.get(segmentId);
      if (!button) return;
      button.scrollIntoView?.({ block: "nearest" });
      button.focus({ preventScroll: true });
    },
  }));

  const ordered = [...segments].sort((a, b) => a.index - b.index);

  return (
    <section aria-labelledby="script-heading" className="rounded-md border border-line bg-surface p-4">
      <h2 id="script-heading" className="font-display text-lg text-foreground">
        Script
      </h2>
      {ordered.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          This project has no script yet. Add one to see which lines have evidence.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {ordered.map((segment) => {
            const state = states[segment.id] ?? "uncovered";
            const label = STATE_LABELS[state];
            const selected = segment.id === selectedSegmentId;
            const playing = segment.id === playingSegmentId;
            return (
              <li key={segment.id}>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) buttons.current.set(segment.id, el);
                    else buttons.current.delete(segment.id);
                  }}
                  aria-pressed={selected}
                  aria-current={playing ? "true" : undefined}
                  data-playing={playing ? "true" : "false"}
                  data-state={state}
                  onClick={() => onSelect(segment.id)}
                  className={`flex w-full flex-wrap items-start gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-left text-sm ${
                    selected ? "border-primary bg-raised" : "border-transparent hover:bg-raised"
                  } ${playing ? "border-l-4 border-l-warn" : ""}`}
                >
                  <span className="w-6 shrink-0 text-right text-muted">{segment.index + 1}.</span>
                  <span className="min-w-0 flex-1 basis-48">{segment.text}</span>
                  <span className="flex items-center gap-1.5 pl-9 text-xs text-muted sm:pl-0">
                    <span aria-hidden="true">
                      {state === "uncovered" ? null : <MarkerShape state={state} />}
                    </span>
                    <span>
                      {label.name} ({label.plain})
                    </span>
                    {playing ? <span className="font-medium text-foreground">Playing now</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});
