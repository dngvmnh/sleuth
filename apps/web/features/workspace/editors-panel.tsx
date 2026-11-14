"use client";

import { useRef, useState } from "react";
import { GuestSessionNote, useGuestAuth } from "@/components/guest-auth-provider";
import { Button } from "@/components/ui/button";
import { guestAuthMessage, type GuestAuth } from "@/lib/guest-auth";
import { ChecklistEditor } from "../checklist/checklist-editor";
import { ScriptEditor } from "../script/script-editor";
import { UploadFlow } from "../upload/upload-flow";
import { AnalysisPanel } from "./analysis-panel";
import { ToolTabs } from "./tool-tabs";
import type { ProjectState } from "./use-project";

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The copy could not be made.";
}

/** Default navigation; tests pass their own. */
function goTo(path: string) {
  window.location.assign(path);
}

/**
 * Script and checklist editors. On the demo they are read-only, with a note and a button
 * that makes an editable copy and opens it.
 */
export function EditorsPanel({
  state,
  navigate = goTo,
  auth,
}: {
  state: ProjectState;
  navigate?: (path: string) => void;
  /** Tests only; pages use the shared guest sign-in from `GuestAuthProvider`. */
  auth?: GuestAuth;
}) {
  const sharedAuth = useGuestAuth();
  const guest = auth ?? sharedAuth;
  const project = state.detail?.project;
  const isDemo = project?.isDemo ?? true;
  const [phase, setPhase] = useState<"idle" | "signing_in" | "copying">("idle");
  const [copyError, setCopyError] = useState<string | undefined>(undefined);
  // A ref blocks a second click in the same tick, before React re-renders.
  const inFlight = useRef(false);
  const copying = phase !== "idle";

  const copy = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setCopyError(undefined);
    // Sign in first (a no-op in fixture mode). If it fails, no copy request is sent.
    if (guest.mode === "supabase") setPhase("signing_in");
    try {
      await guest.ensureSession();
    } catch (e: unknown) {
      setCopyError(guestAuthMessage(e) ?? messageOf(e));
      setPhase("idle");
      inFlight.current = false;
      return;
    }
    setPhase("copying");
    try {
      const id = await state.makeCopy(`Copy of ${project?.name ?? "demo"}`.slice(0, 120));
      // Stay locked while the browser leaves for the copy.
      navigate(`/projects/${encodeURIComponent(id)}`);
    } catch (e: unknown) {
      setCopyError(messageOf(e));
      setPhase("idle");
      inFlight.current = false;
    }
  };

  return (
    <div className="space-y-4">
      {isDemo ? (
        <div className="rounded-md border border-warn bg-surface p-4 text-sm" role="note">
          <p className="font-medium text-foreground">The demo is read-only.</p>
          <p className="mt-1 text-muted">Make an editable copy to change the script or the checklist.</p>
          <Button className="mt-3" size="sm" disabled={copying} aria-busy={copying} onClick={() => void copy()}>
            {phase === "signing_in"
              ? "Starting a guest session..."
              : phase === "copying"
                ? "Making a copy..."
                : "Make an editable copy"}
          </Button>
          <GuestSessionNote className="mt-2" auth={guest} />
          {copyError ? (
            <p role="alert" className="mt-2 text-danger">
              {copyError}
            </p>
          ) : null}
        </div>
      ) : null}
      <ToolTabs
        label="Project tools"
        tabs={[
          {
            id: "script",
            label: "Script",
            content: (
              <ScriptEditor
                text={state.detail?.scriptVersion?.text ?? ""}
                readOnly={isDemo}
                onSave={state.saveScript}
              />
            ),
          },
          {
            id: "checklist",
            label: "Checklist",
            content: (
              <ChecklistEditor
                items={state.detail?.checklist ?? []}
                readOnly={isDemo}
                onSave={state.saveChecklist}
              />
            ),
          },
          {
            id: "upload",
            label: "Upload",
            content: <UploadFlow readOnly={isDemo} requestUploadUrl={state.requestUploadUrl} onUploaded={state.sync} />,
          },
          {
            id: "analysis",
            label: "Analysis",
            content: (
              <AnalysisPanel
                readOnly={isDemo}
                evidence={state.evidence}
                findings={state.findings}
                startAnalysis={state.startAnalysis}
                fetchJob={state.fetchJob}
                onSucceeded={state.sync}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
