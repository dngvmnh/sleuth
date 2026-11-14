/**
 * How many script lines a person has covered. "Covered" means a person confirmed the evidence for
 * the line; an AI candidate alone never counts. The bar carries the number and a text label, so
 * colour is never the only signal.
 */
export function CoverageBar({ covered, total }: { covered: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((covered / total) * 100);
  return (
    <div data-testid="coverage-bar" className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {covered} of {total} script {total === 1 ? "line" : "lines"} covered
        </p>
        <p className="text-xs text-muted">Covered = a person confirmed the evidence</p>
      </div>
      <div
        role="progressbar"
        aria-label="Script lines covered"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={covered}
        aria-valuetext={`${covered} of ${total} lines covered`}
        className="mt-2 h-2 w-full overflow-hidden rounded-full border border-line-strong bg-background"
      >
        <div className="h-full bg-gold" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}