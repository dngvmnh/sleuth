"use client";

import type { ComponentType } from "react";
import type { ChecklistItem, EvidenceCandidate, ScriptSegment } from "@sleuth/contracts";
import type { SegmentState } from "@sleuth/domain";
import { CheckIcon, Icon, LanternIcon, LockIcon, type IconProps } from "@/components/icons";
import { PanelCorners } from "@/components/ornaments";
import { CoverageBar } from "./coverage-bar";
import styles from "./workspace.module.css";

/** The four room states. Each has its own border style and icon, so colour is never the only signal. */
export type RoomState = "covered" | "waiting" | "none" | "stale";

export const ROOM_STATES: RoomState[] = ["covered", "waiting", "none", "stale"];

export const ROOM_TEXT: Record<RoomState, { name: string; meaning: string }> = {
  covered: { name: "Covered", meaning: "A person confirmed the evidence." },
  waiting: { name: "Candidate waiting", meaning: "A match waits for a person to check it." },
  none: { name: "No proof yet", meaning: "Nothing in the video backs it yet." },
  stale: { name: "Stale after edit", meaning: "The script or video changed after the match." },
};

/** Clock face: for evidence made stale by an edit. */
function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

const ROOM_ICON: Record<RoomState, ComponentType<IconProps>> = {
  covered: CheckIcon,
  waiting: LanternIcon,
  none: LockIcon,
  stale: ClockIcon,
};

/** Border style, text colour and motion per state. Styles differ, not only colours. */
const ROOM_STYLE: Record<RoomState, string> = {
  covered: "border-2 border-solid border-gold text-gold",
  waiting: "border-2 border-dashed border-spectral text-spectral",
  none: "border-2 border-dotted border-line-strong text-muted",
  stale: "border-4 border-double border-warn text-warn",
};

/**
 * Room state from the domain's line state (`deriveSegmentStates`, the same rules as the
 * timeline). An outside-proof candidate also waits for a person, so it is "waiting".
 */
export function roomStateOf(state: SegmentState | undefined): RoomState {
  switch (state) {
    case "covered":
      return "covered";
    case "needs_review":
    case "outside_proof":
      return "waiting";
    case "stale":
      return "stale";
    default:
      return "none";
  }
}

export type RoomSize = "S" | "M" | "L";

/** Room size by text length, like a floor plan: short lines are small rooms. */
export function sizeOf(text: string): RoomSize {
  if (text.length <= 40) return "S";
  if (text.length <= 80) return "M";
  return "L";
}

const SIZE_CLASS: Record<RoomSize, string> = {
  S: "col-span-1 sm:col-span-2",
  M: "col-span-1 sm:col-span-3",
  L: "col-span-2 sm:col-span-6",
};

export interface Room {
  key: string;
  kind: "line" | "item";
  /** 1-based number shown to people. */
  number: number;
  text: string;
  state: RoomState;
  /** The script line a click selects: the line itself, or the line with the item's evidence. */
  segmentId: string | null;
}

const STATE_RANK: RoomState[] = ["covered", "waiting", "stale", "none"];

/**
 * One room per script line and per checklist item. A checklist item takes the best state of the
 * lines whose evidence is linked to it, so both kinds follow the same domain rules.
 */
export function buildRooms(
  segments: readonly ScriptSegment[],
  states: Readonly<Record<string, SegmentState>>,
  checklist: readonly ChecklistItem[],
  evidence: readonly EvidenceCandidate[],
): Room[] {
  const lines: Room[] = [...segments]
    .sort((a, b) => a.index - b.index)
    .map((s) => ({
      key: `line-${s.id}`,
      kind: "line",
      number: s.index + 1,
      text: s.text,
      state: roomStateOf(states[s.id]),
      segmentId: s.id,
    }));
  const known = new Set(segments.map((s) => s.id));
  const items: Room[] = [...checklist]
    .sort((a, b) => a.position - b.position)
    .map((item, i) => {
      const linked = evidence.filter(
        (e) => e.checklistItemId === item.id && e.status !== "rejected" && known.has(e.scriptSegmentId),
      );
      const ranked = linked
        .map((e) => ({ segmentId: e.scriptSegmentId, state: roomStateOf(states[e.scriptSegmentId]) }))
        .sort((a, b) => STATE_RANK.indexOf(a.state) - STATE_RANK.indexOf(b.state));
      return {
        key: `item-${item.id}`,
        kind: "item",
        number: i + 1,
        text: item.label,
        state: ranked[0]?.state ?? "none",
        segmentId: ranked[0]?.segmentId ?? null,
      };
    });
  return [...lines, ...items];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function RoomButton({
  room,
  selected,
  onClick,
}: {
  room: Room;
  selected: boolean;
  onClick: () => void;
}) {
  const RoomIcon = ROOM_ICON[room.state];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-room-state={room.state}
      className={`${SIZE_CLASS[sizeOf(room.text)]} flex min-h-20 flex-col items-start gap-1 relative rounded-[2px] bg-background/60 p-2 text-left ${ROOM_STYLE[room.state]} ${room.state === "waiting" ? (styles.waiting ?? "") : ""} ${
        selected ? "bg-raised outline outline-2 outline-offset-2 outline-primary" : "hover:bg-raised"
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <RoomIcon size={14} />
        {/*
          The visible words are the button's name (WCAG 2.5.3, label in name). The punctuation and
          the word "Checklist" are for screen readers only, and the dot is hidden from them.
        */}
        <span>
          {room.kind === "item" ? <span className="sr-only">Checklist </span> : null}
          {room.kind === "line" ? `Line ${room.number}` : `Item ${room.number}`}
          <span className="sr-only">, </span>
        </span>{" "}
        <span className="font-normal">
          <span aria-hidden="true" className="mr-1.5">·</span>
          {ROOM_TEXT[room.state].name}
          <span className="sr-only">: </span>
        </span>
      </span>{" "}
      <span className="line-clamp-2 text-xs text-foreground">{room.text}</span>
    </button>
  );
}

export interface ClaimsMapProps {
  rooms: readonly Room[];
  selectedSegmentId: string | null;
  /** Select this script line and seek the timeline to its evidence. */
  onSelectLine: (segmentId: string) => void;
  /** A checklist room with no evidence has no line to open; say so instead. */
  onAnnounce: (message: string) => void;
  /** Script lines a person covered, for the coverage bar. */
  linesCovered: number;
  linesTotal: number;
}

/**
 * "A house of claims": a floor plan with one room per script line (ground floor) and per
 * checklist item (upper floor). A room is a button; a click selects its line and moves the clock.
 */
export function ClaimsMap({ rooms, selectedSegmentId, onSelectLine, onAnnounce, linesCovered, linesTotal }: ClaimsMapProps) {
  const covered = rooms.filter((r) => r.state === "covered").length;
  const floors: { title: string; kind: Room["kind"] }[] = [
    { title: "Checklist items", kind: "item" },
    { title: "Script lines", kind: "line" },
  ];

  const open = (room: Room) => {
    if (room.segmentId) onSelectLine(room.segmentId);
    else onAnnounce(`Checklist item ${room.number} has no evidence yet, so there is no line to open.`);
  };

  return (
    <section aria-labelledby="claims-map-heading" className="panel p-4 sm:p-5" data-testid="claims-map">
      <PanelCorners />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">The floor plan</p>
          <h2 id="claims-map-heading" className="mt-1 font-display text-2xl text-foreground">
            Claims map
          </h2>
        </div>
        <p className="text-right" data-testid="claims-count">
          <span className="block font-display text-6xl leading-none text-foreground tabular-nums">{pad2(covered)}</span>
          <span className="text-sm text-muted">
            of {rooms.length} {rooms.length === 1 ? "claim" : "claims"} covered
          </span>
        </p>
      </div>

      {rooms.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No script lines or checklist items yet, so the house has no rooms.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {floors.map((floor) => {
            const here = rooms.filter((r) => r.kind === floor.kind);
            if (here.length === 0) return null;
            return (
              <div key={floor.kind} className="panel-inset p-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">{floor.title}</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                  {here.map((room) => (
                    <RoomButton
                      key={room.key}
                      room={room}
                      selected={room.segmentId !== null && room.segmentId === selectedSegmentId}
                      onClick={() => open(room)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ul aria-label="Room states" className="mt-4 grid gap-2 text-xs sm:grid-cols-2" role="list">
        {ROOM_STATES.map((state) => {
          const StateIcon = ROOM_ICON[state];
          return (
            <li key={state} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex size-6 flex-none items-center justify-center rounded-[2px] ${ROOM_STYLE[state]}`}
              >
                <StateIcon size={12} />
              </span>
              <span>
                <span className="font-semibold text-foreground">{ROOM_TEXT[state].name}</span>{" "}
                <span className="text-muted">{ROOM_TEXT[state].meaning}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <CoverageBar covered={linesCovered} total={linesTotal} />
      </div>
    </section>
  );
}
