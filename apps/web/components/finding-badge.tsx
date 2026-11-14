import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";
import { FINDING_ICONS } from "@/components/icons";

/**
 * A finding label: the finding's icon, the spooky name and its plain-English name. The icon has a
 * different shape for each type, so a type never relies on colour alone.
 */
export function FindingBadge({ type }: { type: FindingType }) {
  const label = FINDING_LABELS[type];
  const FindingIcon = FINDING_ICONS[type];
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded border border-line-strong px-2 py-0.5 text-xs">
      <FindingIcon size={14} />
      <span className="font-medium text-foreground">{label.spooky}</span>
      <span className="text-muted">({label.plain})</span>
    </span>
  );
}