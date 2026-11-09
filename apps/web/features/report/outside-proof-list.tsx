import type { OutsideProofItem, ScriptSegment } from "@sleuth/contracts";

/**
 * Script lines whose claims footage cannot prove (security, compliance, guarantees), with the
 * kind of proof that could back each one and whether a person has marked it or the software
 * only proposed it. Data comes from `coverage.outsideProof`.
 */
export function OutsideProofList({
  items,
  segments,
}: {
  items: readonly OutsideProofItem[];
  segments: readonly ScriptSegment[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">No script line needs proof from outside the video.</p>;
  }
  return (
    <ul className="space-y-2 text-sm" aria-label="Lines that need outside proof">
      {items.map((o) => {
        const line = segments.find((s) => s.id === o.scriptSegmentId);
        return (
          <li
            key={o.scriptSegmentId}
            className="rounded-md border border-line p-3"
            data-testid="outside-proof"
            data-acknowledged={o.acknowledged ? "true" : "false"}
          >
            <p className="text-foreground">{line ? `Line ${line.index + 1}: ${line.text}` : o.scriptSegmentId}</p>
            <p className="mt-1 text-muted">Proof that could back it: {o.hint}</p>
            <p className="mt-1 text-foreground" data-testid="outside-proof-status">
              {o.acknowledged
                ? "Marked by a person: this needs proof from outside the video."
                : "Proposed by the software only. Nobody has marked it yet."}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
