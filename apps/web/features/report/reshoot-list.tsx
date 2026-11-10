"use client";

import type { ChecklistItem, ReshootTask, ScriptSegment } from "@sleuth/contracts";
import { Button } from "@/components/ui/button";

export const DONE_DOES_NOT_PROVE =
  "Marking a reshoot done only closes the reshoot task. The checklist item becomes Proven only when new evidence is found and a person confirms it.";

export interface ReshootListProps {
  reshoots: readonly ReshootTask[];
  checklist: readonly ChecklistItem[];
  segments: readonly ScriptSegment[];
  /** Owner of an editable project. False for the demo and for anyone else. */
  canManage: boolean;
  /** The reshoot whose update is running, if any. Every Mark done waits while one runs. */
  updatingId: string | undefined;
  error: { reshootId: string; message: string } | undefined;
  onMarkDone: (reshootId: string) => void;
}

function aboutText(r: ReshootTask, checklist: readonly ChecklistItem[], segments: readonly ScriptSegment[]): string[] {
  const parts: string[] = [];
  const item = checklist.find((c) => c.id === r.checklistItemId);
  if (item) parts.push(`Checklist item: ${item.label}`);
  const line = segments.find((s) => s.id === r.scriptSegmentId);
  if (line) parts.push(`Line ${line.index + 1}: ${line.text}`);
  return parts;
}

function Row({
  r,
  props,
}: {
  r: ReshootTask;
  props: ReshootListProps;
}) {
  const about = aboutText(r, props.checklist, props.segments);
  const busy = props.updatingId === r.id;
  return (
    <li className="rounded-md border border-line p-3 text-sm" data-testid="reshoot" data-status={r.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-foreground">{r.note}</p>
          {about.length > 0 ? (
            <ul className="mt-1 text-muted">
              {about.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted">Not linked to a checklist item or a script line.</p>
          )}
        </div>
        <span className="rounded border border-line px-2 py-0.5 text-xs text-foreground" data-testid="reshoot-status">
          {r.status === "open" ? "Open" : "Done"}
        </span>
      </div>
      {r.status === "open" && props.canManage ? (
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          disabled={props.updatingId !== undefined}
          aria-busy={busy}
          aria-label={`Mark done: ${r.note}`}
          onClick={() => props.onMarkDone(r.id)}
        >
          {busy ? "Saving..." : "Mark done"}
        </Button>
      ) : null}
      {props.error?.reshootId === r.id ? (
        <p role="alert" className="mt-2 text-danger">
          Could not update the reshoot: {props.error.message}
        </p>
      ) : null}
    </li>
  );
}

/** Reshoot tasks, open first, then done. Only the project owner can mark one done. */
export function ReshootList(props: ReshootListProps) {
  const open = props.reshoots.filter((r) => r.status === "open");
  const done = props.reshoots.filter((r) => r.status === "done");

  return (
    <div>
      <p className="text-sm text-muted">{DONE_DOES_NOT_PROVE}</p>
      {!props.canManage ? (
        <p className="mt-1 text-sm text-muted">Read-only: only the owner of an editable copy can mark reshoots done.</p>
      ) : null}

      <h3 className="mt-3 text-sm font-medium text-foreground">Open ({open.length})</h3>
      {open.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No open reshoot tasks.</p>
      ) : (
        <ul className="mt-2 space-y-2" aria-label="Open reshoots">
          {open.map((r) => (
            <Row key={r.id} r={r} props={props} />
          ))}
        </ul>
      )}

      <h3 className="mt-4 text-sm font-medium text-foreground">Done ({done.length})</h3>
      {done.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No reshoot tasks are done yet.</p>
      ) : (
        <ul className="mt-2 space-y-2" aria-label="Done reshoots">
          {done.map((r) => (
            <Row key={r.id} r={r} props={props} />
          ))}
        </ul>
      )}
    </div>
  );
}
