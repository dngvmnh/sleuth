"use client";

import { useId, useState } from "react";
import type { ChecklistItem } from "@sleuth/contracts";
import { Button } from "@/components/ui/button";

export const MAX_ITEMS = 50;
export const MAX_LABEL = 300;

export interface ChecklistEditorProps {
  items: readonly ChecklistItem[];
  readOnly: boolean;
  /** Saves the whole list in order. */
  onSave: (labels: string[]) => Promise<unknown>;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The checklist could not be saved.";
}

/** Add, remove and reorder checklist items, then save the whole list at once. */
export function ChecklistEditor({ items, readOnly, onSave }: ChecklistEditorProps) {
  const [labels, setLabels] = useState(() =>
    [...items].sort((a, b) => a.position - b.position).map((i) => i.label),
  );
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const inputId = useId();

  const change = (next: string[], message: string) => {
    setLabels(next);
    setStatus(message);
    setError(undefined);
  };

  const add = () => {
    const label = newLabel.trim();
    if (label === "" || labels.length >= MAX_ITEMS) return;
    change([...labels, label], `Added "${label}". Not saved yet.`);
    setNewLabel("");
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= labels.length) return;
    const next = [...labels];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    change(next, `Moved "${item}" to position ${to + 1}. Not saved yet.`);
  };

  const save = async () => {
    if (saving || readOnly || labels.length === 0) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave(labels);
      setStatus(`Checklist saved with ${labels.length} ${labels.length === 1 ? "item" : "items"}.`);
    } catch (e: unknown) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="checklist-editor-heading" className="rounded-md border border-line bg-surface p-4">
      <h2 id="checklist-editor-heading" className="font-display text-lg text-foreground">
        Checklist
      </h2>
      <p className="mt-1 text-sm text-muted">What the demo must show, in order.</p>
      {labels.length === 0 ? <p className="mt-3 text-sm text-muted">No checklist items yet.</p> : null}
      <ol className="mt-3 space-y-2" aria-label="Checklist items">
        {labels.map((label, index) => (
          <li key={`${index}-${label}`} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-6 shrink-0 text-right text-muted">{index + 1}.</span>
            <span className="min-w-0 flex-1 basis-40">{label}</span>
            {readOnly ? null : (
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving || index === 0}
                  aria-label={`Move "${label}" up`}
                  onClick={() => move(index, index - 1)}
                >
                  Up
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving || index === labels.length - 1}
                  aria-label={`Move "${label}" down`}
                  onClick={() => move(index, index + 1)}
                >
                  Down
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  aria-label={`Remove "${label}"`}
                  onClick={() =>
                    change(
                      labels.filter((_, i) => i !== index),
                      `Removed "${label}". Not saved yet.`,
                    )
                  }
                >
                  Remove
                </Button>
              </span>
            )}
          </li>
        ))}
      </ol>

      {readOnly ? null : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label htmlFor={inputId} className="flex min-w-48 flex-1 flex-col text-sm text-muted">
              New item
              <input
                id={inputId}
                value={newLabel}
                maxLength={MAX_LABEL}
                onChange={(e) => setNewLabel(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                className="mt-1 rounded-md border border-line bg-background p-2 text-sm text-foreground"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={saving || newLabel.trim() === "" || labels.length >= MAX_ITEMS}
              onClick={add}
            >
              Add item
            </Button>
          </div>
          {labels.length >= MAX_ITEMS ? (
            <p className="mt-1 text-xs text-muted">The checklist can hold at most {MAX_ITEMS} items.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={saving || labels.length === 0} onClick={() => void save()}>
              {saving ? "Saving..." : "Save checklist"}
            </Button>
            {labels.length === 0 ? (
              <span className="text-xs text-muted">Add at least one item to save.</span>
            ) : null}
          </div>
        </>
      )}

      <p role="status" aria-live="polite" className="mt-2 text-sm text-muted">
        {status}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
