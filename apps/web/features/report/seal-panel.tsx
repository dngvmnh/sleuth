"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { Seal, SealBlocker } from "@sleuth/contracts";
import { LiveRegion } from "@/components/live-region";
import { Button } from "@/components/ui/button";
import { SealConfirmation } from "./seal-confirmation";
import type { SealResult } from "./use-report";

/** A plain sentence for each blocker, and where to fix it. */
export const BLOCKER_TEXT: Record<SealBlocker, string> = {
  undecided_candidates:
    "Some evidence candidates are still undecided. Confirm or reject each one in the workspace.",
  stale_evidence:
    "Some evidence is out of date (Poltergeist, evidence out of date). Dismiss it in the workspace, then re-check the changed lines.",
  uncovered_items:
    "Some checklist items have no usable evidence (Ghost, no visual evidence). Find evidence, ask for a reshoot, or change the checklist.",
  job_running: "An analysis is still queued or running. Wait for it to finish.",
  no_analysis: "This project has no analysis yet. Run an analysis in the workspace.",
};

export const NOTE_MAX = 1000;

export interface SealPanelProps {
  projectId: string;
  seal: Seal | null;
  blockers: readonly SealBlocker[];
  /** The owner of an editable project. False on the demo. */
  canManage: boolean;
  onSeal: (note: string) => Promise<SealResult>;
}

/**
 * Final Seal action. Only the owner of an editable project sees the button. While the server
 * reports blockers the button is disabled and each blocker is explained. Otherwise the
 * person reviews a confirm step (with an optional note) before anything is sent.
 */
export function SealPanel({ projectId, seal, blockers, canManage, onSeal }: SealPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [justSealed, setJustSealed] = useState<Seal | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const noteId = useId();
  const blockersId = useId();
  // Keyboard users keep their place: focus moves to the note when the confirm step opens,
  // back to the button on Cancel or refusal, and to the confirmation after a seal.
  const pendingFocus = useRef<"note" | "apply" | "confirmation" | null>(null);
  const setFocusTarget = (target: "note" | "apply" | "confirmation") => {
    pendingFocus.current = target;
  };
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  // After each render, move focus once if a handler asked for it (the target exists by then).
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    const el = target === "note" ? noteRef.current : target === "apply" ? applyRef.current : confirmationRef.current;
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  });

  const workspace = `/projects/${encodeURIComponent(projectId)}`;
  const activeSeal = seal?.status === "active" ? seal : undefined;
  const blocked = blockers.length > 0;

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError(undefined);
    const result = await onSeal(note);
    setSending(false);
    if (result.kind === "sealed") {
      setConfirming(false);
      setNote("");
      setJustSealed(result.seal);
      setAnnouncement("The Final Seal was applied. The report is now signed off.");
      setFocusTarget("confirmation");
    } else if (result.kind === "blocked") {
      // The new blockers come back through props; close the confirm step so they show.
      setConfirming(false);
      setFocusTarget("apply");
      setError(`${result.message} See what still blocks it below.`);
      setAnnouncement("The Final Seal was refused. See the list of what still blocks it.");
    } else if (result.kind === "failed") {
      setError(result.message);
      setAnnouncement("The Final Seal was not applied.");
    }
  };

  return (
    <section aria-labelledby="seal-heading" className="rounded-md border border-line bg-surface p-4 print:hidden">
      <h2 id="seal-heading" className="font-display text-xl text-foreground">
        Final Seal
      </h2>

      {justSealed ? <SealConfirmation ref={confirmationRef} seal={justSealed} /> : null}

      {!canManage ? (
        <p className="mt-2 text-sm text-muted">
          Read-only: only the owner of an editable copy can apply the Final Seal. The public demo cannot be sealed.
        </p>
      ) : activeSeal ? (
        <p className="mt-2 text-sm text-muted">
          This project is sealed. A script or video change that makes evidence out of date will break the seal.
        </p>
      ) : (
        <>
          {blocked ? (
            <div className="mt-2">
              <p id={blockersId} className="text-sm font-medium text-foreground">
                The Final Seal is not available yet:
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted" aria-label="What blocks the Final Seal">
                {blockers.map((b) => (
                  <li key={b} data-blocker={b}>
                    <span id={`${blockersId}-${b}`}>{BLOCKER_TEXT[b]}</span>{" "}
                    {b !== "job_running" ? (
                      // Underlined, not colour only: it sits inside a sentence (axe link-in-text-block).
                      <Link className="text-primary-strong underline underline-offset-4" href={workspace}>
                        Open the workspace
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing blocks the Final Seal. Check the report above before you sign.</p>
          )}

          {!confirming ? (
            <Button
              ref={applyRef}
              className="mt-3"
              disabled={blocked}
              // Point at the sentences themselves. Pointing at a wrapper around the labelled list made
              // Narrator read the list's label instead of the reasons (live check, 2026-11-11).
              aria-describedby={
                blocked ? [blockersId, ...blockers.map((b) => `${blockersId}-${b}`)].join(" ") : undefined
              }
              onClick={() => {
                setError(undefined);
                setConfirming(true);
                setFocusTarget("note");
              }}
            >
              Apply the Final Seal
            </Button>
          ) : (
            <div className="mt-3 rounded-md border border-warn p-3" role="group" aria-labelledby={`${noteId}-confirm`}>
              <p id={`${noteId}-confirm`} className="text-sm font-medium text-foreground">
                You are signing that you reviewed these items. Software found the candidates; your sign-off is the
                human check.
              </p>
              <label htmlFor={noteId} className="mt-3 block text-sm text-muted">
                Note (optional)
              </label>
              <textarea
                ref={noteRef}
                id={noteId}
                value={note}
                maxLength={NOTE_MAX}
                rows={3}
                onChange={(e) => setNote(e.currentTarget.value)}
                className="mt-1 w-full rounded-md border border-line bg-background p-2 text-sm text-foreground"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={sending} aria-busy={sending} onClick={() => void send()}>
                  {sending ? "Sealing..." : "Sign and seal"}
                </Button>
                <Button
                  variant="outline"
                  disabled={sending}
                  onClick={() => {
                    setConfirming(false);
                    setFocusTarget("apply");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <LiveRegion message={announcement} />
    </section>
  );
}
