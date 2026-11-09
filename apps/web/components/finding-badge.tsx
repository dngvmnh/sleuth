import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";

/** A finding label: the spooky name always followed by its plain-English name. */
export function FindingBadge({ type }: { type: FindingType }) {
  const label = FINDING_LABELS[type];
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1 rounded border border-line px-2 py-0.5 text-xs">
      <span className="font-medium text-foreground">{label.spooky}</span>
      <span className="text-muted">({label.plain})</span>
    </span>
  );
}
