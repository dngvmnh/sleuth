"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * "Ask for a reshoot" for a checklist item with no usable footage (Ghost). Opens an inline
 * note, then creates a reshoot task for that item. The coverage state then comes back from
 * the API as `reshoot`; this component never sets it.
 */
export function RequestReshoot({
  itemLabel,
  busy,
  locked,
  error,
  onRequest,
}: {
  itemLabel: string;
  /** This item's request is running. */
  busy: boolean;
  /** Any reshoot change is running; wait. */
  locked: boolean;
  error: string | undefined;
  onRequest: (note: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) noteRef.current?.focus();
  }, [open]);
  const trimmed = note.trim();

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={locked}
        aria-label={`Ask for a reshoot: ${itemLabel}`}
        onClick={() => setOpen(true)}
      >
        Ask for a reshoot
      </Button>
    );
  }
  return (
    <div className="mt-2">
      <label htmlFor={noteId} className="block text-xs text-muted">
        What to film again for “{itemLabel}”
      </label>
      <textarea
        ref={noteRef}
        id={noteId}
        value={note}
        rows={2}
        maxLength={1000}
        onChange={(e) => setNote(e.currentTarget.value)}
        className="mt-1 w-full rounded-md border border-line bg-background p-2 text-sm text-foreground"
      />
      <div className="mt-1 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={locked || trimmed === ""}
          aria-busy={busy}
          onClick={async () => {
            if (await onRequest(trimmed)) {
              setOpen(false);
              setNote("");
            }
          }}
        >
          {busy ? "Saving..." : "Create reshoot task"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          Could not create the reshoot task: {error}
        </p>
      ) : null}
    </div>
  );
}
