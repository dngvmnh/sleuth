"use client";

import { useId, useState } from "react";
import type { CreateScriptResponse, ScriptSegment } from "@sleuth/contracts";
import { Button } from "@/components/ui/button";

export interface ScriptEditorProps {
  /** Current script text, or "" when the project has none. */
  text: string;
  readOnly: boolean;
  /** Saves a new script version; resolves with the server's answer, rejects with its error. */
  onSave: (text: string) => Promise<CreateScriptResponse>;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The script could not be saved.";
}

function lineOf(segments: readonly ScriptSegment[], id: string): ScriptSegment | undefined {
  return segments.find((s) => s.id === id);
}

/** What the save changed, as the server reported it. The UI never works this out itself. */
function SaveSummary({ result }: { result: CreateScriptResponse }) {
  const { diff, staleEvidenceIds, scriptVersion } = result;
  const changed = [...diff.modified, ...diff.added]
    .map((id) => ({ id, kind: diff.added.includes(id) ? "added" : "changed", segment: lineOf(scriptVersion.segments, id) }))
    .sort((a, b) => (a.segment?.index ?? 0) - (b.segment?.index ?? 0));

  return (
    <div className="mt-3 rounded-md border border-line p-3 text-sm" data-testid="script-save-summary">
      <p className="font-medium text-foreground">Saved as version {scriptVersion.version}.</p>
      {changed.length === 0 && diff.removed.length === 0 ? (
        <p className="mt-1 text-muted">No line changed in a way that matters for evidence.</p>
      ) : (
        <ul className="mt-2 space-y-1" aria-label="Changed lines">
          {changed.map(({ id, kind, segment }) => (
            <li key={id}>
              Line {segment ? segment.index + 1 : "?"} {kind}: <span className="text-muted">{segment?.text}</span>
            </li>
          ))}
          {diff.removed.length > 0 ? (
            <li>
              {diff.removed.length} {diff.removed.length === 1 ? "line" : "lines"} removed
            </li>
          ) : null}
        </ul>
      )}
      <p className="mt-2 font-medium text-foreground" data-testid="stale-summary">
        {staleEvidenceIds.length === 0
          ? "No evidence affected."
          : `${staleEvidenceIds.length} evidence ${staleEvidenceIds.length === 1 ? "candidate is" : "candidates are"} now out of date (Poltergeist, Evidence out of date).`}
      </p>
      {staleEvidenceIds.length > 0 ? (
        <p className="mt-1 text-muted">
          Only the evidence tied to the changed lines went out of date. Re-check those lines to get new candidates.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Plain-text script editor. Saving posts a new script version; the old one is kept.
 * The summary shows the server's diff and the evidence it marked out of date.
 */
export function ScriptEditor({ text, readOnly, onSave }: ScriptEditorProps) {
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CreateScriptResponse | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const fieldId = useId();
  const unchanged = draft.trim() === text.trim();

  const save = async () => {
    if (saving || readOnly || draft.trim() === "") return;
    setSaving(true);
    setError(undefined);
    try {
      setResult(await onSave(draft));
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="script-editor-heading" className="rounded-md border border-line bg-surface p-4">
      <h2 id="script-editor-heading" className="font-display text-lg text-foreground">
        Edit script
      </h2>
      <label htmlFor={fieldId} className="mt-2 block text-sm text-muted">
        Script text. Each sentence becomes one numbered line.
      </label>
      <textarea
        id={fieldId}
        value={draft}
        readOnly={readOnly}
        aria-readonly={readOnly}
        rows={8}
        maxLength={20000}
        onChange={(e) => {
          setDraft(e.currentTarget.value);
          setResult(undefined);
        }}
        className="mt-1 w-full rounded-md border border-line bg-background p-2 text-sm text-foreground"
      />
      {readOnly ? null : (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={saving || unchanged || draft.trim() === ""} onClick={() => void save()}>
            {saving ? "Saving..." : "Save script"}
          </Button>
          {unchanged ? <span className="text-xs text-muted">No unsaved changes.</span> : null}
        </div>
      )}
      <div aria-live="polite">{result ? <SaveSummary result={result} /> : null}</div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
