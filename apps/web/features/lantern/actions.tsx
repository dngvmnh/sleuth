"use client";

import { useId, useState } from "react";
import type { EvidenceCandidate, ReviewDecisionKind } from "@sleuth/contracts";
import { Button } from "@/components/ui/button";

export const DEMO_REASON = "The demo project is read-only. Make an editable copy to review evidence.";
export const STALE_REASON =
  "This evidence is out of date, so it cannot be confirmed or relabelled. Dismiss it, then re-check the line.";

export interface ExorcismActionsProps {
  evidence: EvidenceCandidate;
  isDemo: boolean;
  /** A review request is running (for any evidence). All actions wait. */
  pending: boolean;
  /** Server text from a failed request for THIS evidence, shown unchanged. */
  error: string | undefined;
  onDecide: (decision: ReviewDecisionKind) => void;
  onReshoot: (note: string) => void;
}

interface Choice {
  decision: ReviewDecisionKind;
  label: string;
  /** Allowed on stale evidence (only a dismissal is). */
  allowedWhenStale: boolean;
}

const CHOICES: Choice[] = [
  { decision: "confirm", label: "Confirm evidence", allowedWhenStale: false },
  { decision: "reject", label: "Reject", allowedWhenStale: true },
  { decision: "needs_reshoot", label: "Needs reshoot", allowedWhenStale: false },
  { decision: "needs_outside_proof", label: "Needs outside proof", allowedWhenStale: false },
];

/**
 * Exorcism: the four human decisions on one evidence candidate, one at a time. There is no
 * bulk action. Disabled actions say why. The server decides whether a decision is allowed;
 * its message is shown as it came.
 */
export function ExorcismActions({ evidence, isDemo, pending, error, onDecide, onReshoot }: ExorcismActionsProps) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const noteId = useId();
  const reasonId = useId();
  const stale = evidence.status === "stale";
  const reason = isDemo ? DEMO_REASON : stale ? STALE_REASON : undefined;
  const trimmed = note.trim();

  const submitNote = () => {
    if (trimmed === "" || pending) return;
    onReshoot(trimmed);
    setNoting(false);
    setNote("");
  };

  return (
    <div className="mt-4" role="group" aria-labelledby={`${reasonId}-heading`}>
      <h3 id={`${reasonId}-heading`} className="text-sm font-medium text-foreground">
        Your decision
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {CHOICES.map((choice) => {
          const blocked = isDemo || (stale && !choice.allowedWhenStale);
          const label = stale && choice.decision === "reject" ? "Dismiss" : choice.label;
          return (
            <Button
              key={choice.decision}
              size="sm"
              variant={choice.decision === "confirm" ? "primary" : "outline"}
              disabled={blocked || pending}
              aria-describedby={blocked && reason ? reasonId : undefined}
              onClick={() => {
                if (choice.decision === "needs_reshoot") setNoting(true);
                else onDecide(choice.decision);
              }}
            >
              {label}
            </Button>
          );
        })}
      </div>

      {reason ? (
        <p id={reasonId} className="mt-2 text-sm text-muted">
          {reason}
        </p>
      ) : null}

      {noting && !isDemo && !stale ? (
        <div className="mt-3">
          <label htmlFor={noteId} className="text-sm font-medium text-foreground">
            Reshoot note
          </label>
          <textarea
            id={noteId}
            value={note}
            maxLength={1000}
            rows={3}
            onChange={(e) => setNote(e.currentTarget.value)}
            className="mt-1 w-full rounded-md border border-line-strong bg-background p-2 text-sm text-foreground"
          />
          <p className="mt-1 text-xs text-muted">
            Say what to film again. This creates a reshoot task.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={trimmed === "" || pending} onClick={submitNote}>
              Create reshoot task
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setNoting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {pending ? (
        <p role="status" className="mt-2 text-sm text-muted">
          Saving your decision...
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
