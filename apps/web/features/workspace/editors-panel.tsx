"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChecklistEditor } from "../checklist/checklist-editor";
import { ScriptEditor } from "../script/script-editor";
import { UploadFlow } from "../upload/upload-flow";
import { AnalysisPanel } from "./analysis-panel";
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
}: {
  state: ProjectState;
  navigate?: (path: string) => void;
}) {
  const project = state.detail?.project;
  const isDemo = project?.isDemo ?? true;
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | undefined>(undefined);

  const copy = async () => {
    if (copying) return;
    setCopying(true);
    setCopyError(undefined);
    try {
      const id = await state.makeCopy(`Copy of ${project?.name ?? "demo"}`.slice(0, 120));
      navigate(`/projects/${encodeURIComponent(id)}`);
    } catch (e: unknown) {
      setCopyError(messageOf(e));
      setCopying(false);
    }
  };

  return (
    <div className="space-y-4">
      {isDemo ? (
        <div className="rounded-md border border-warn bg-surface p-4 text-sm" role="note">
          <p className="font-medium text-foreground">The demo is read-only.</p>
          <p className="mt-1 text-muted">Make an editable copy to change the script or the checklist.</p>
          <Button className="mt-3" size="sm" disabled={copying} onClick={() => void copy()}>
            {copying ? "Making a copy..." : "Make an editable copy"}
          </Button>
          {copyError ? (
            <p role="alert" className="mt-2 text-danger">
              {copyError}
            </p>
          ) : null}
        </div>
      ) : null}
      <UploadFlow readOnly={isDemo} requestUploadUrl={state.requestUploadUrl} onUploaded={state.sync} />
      <AnalysisPanel
        readOnly={isDemo}
        evidence={state.evidence}
        findings={state.findings}
        startAnalysis={state.startAnalysis}
        fetchJob={state.fetchJob}
        onSucceeded={state.sync}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ScriptEditor
          text={state.detail?.scriptVersion?.text ?? ""}
          readOnly={isDemo}
          onSave={state.saveScript}
        />
        <ChecklistEditor
          items={state.detail?.checklist ?? []}
          readOnly={isDemo}
          onSave={state.saveChecklist}
        />
      </div>
    </div>
  );
}
