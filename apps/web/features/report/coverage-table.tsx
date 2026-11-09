import type { ChecklistItem, CoverageState, CoverageSummary } from "@sleuth/contracts";
import { COVERAGE_LABELS, COVERAGE_ORDER } from "./labels";
import { RequestReshoot } from "./request-reshoot";

const STATE_CLASS: Record<CoverageState, string> = {
  proven: "text-ok",
  needs_review: "text-primary-strong",
  outside_proof: "text-danger",
  reshoot: "text-warn",
  uncovered: "text-muted",
};

/** A different shape per state, so the state reads without colour. */
export function CoverageIcon({ state }: { state: CoverageState }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, className: "shrink-0" } as const;
  switch (state) {
    case "proven": // check mark
      return (
        <svg {...common}>
          <path d="M2 8.5 L6 12 L14 4" fill="none" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      );
    case "needs_review": // hollow circle
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "outside_proof": // diamond
      return (
        <svg {...common}>
          <path d="M8 1 L15 8 L8 15 L1 8 Z" fill="currentColor" />
        </svg>
      );
    case "reshoot": // circular arrow
      return (
        <svg {...common}>
          <path d="M13 8 A5 5 0 1 1 8 3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 0.5 L11 3 L8 5.5 Z" fill="currentColor" />
        </svg>
      );
    case "uncovered": // dashed empty square
      return (
        <svg {...common}>
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
        </svg>
      );
  }
}

export function CoverageStateLabel({ state }: { state: CoverageState }) {
  const label = COVERAGE_LABELS[state];
  return (
    <span className={`inline-flex items-center gap-2 ${STATE_CLASS[state]}`} data-state={state}>
      <CoverageIcon state={state} />
      <span className="text-foreground">
        {label.name} <span className="text-muted">({label.meaning})</span>
      </span>
    </span>
  );
}

/**
 * Totals and one row per checklist item. States, totals and the percentage come from the
 * API (`GET /coverage`); this component never works them out.
 */
export interface CoverageActions {
  updatingId: string | undefined;
  error: { reshootId: string; message: string } | undefined;
  onRequestReshoot: (checklistItemId: string, note: string) => Promise<boolean>;
}

export function CoverageTable({
  coverage,
  checklist,
  actions,
}: {
  coverage: CoverageSummary;
  checklist: readonly ChecklistItem[];
  /** Given only to the owner of an editable project: lets them ask for a reshoot of a Ghost item. */
  actions?: CoverageActions;
}) {
  const label = new Map(checklist.map((c) => [c.id, c]));
  const rows = [...coverage.items].sort(
    (a, b) => (label.get(a.checklistItemId)?.position ?? 0) - (label.get(b.checklistItemId)?.position ?? 0),
  );

  return (
    <div>
      <p className="text-sm text-foreground" data-testid="coverage-proven">
        {coverage.totals.proven} of {coverage.items.length} checklist{" "}
        {coverage.items.length === 1 ? "item" : "items"} proven ({coverage.provenPercent}%).
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Coverage totals">
        {COVERAGE_ORDER.map((state) => (
          <li key={state} className="inline-flex items-center gap-1.5">
            <span className={STATE_CLASS[state]}>
              <CoverageIcon state={state} />
            </span>
            {COVERAGE_LABELS[state].name}: {coverage.totals[state]}
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          This project has no checklist items, so there is nothing to cover. An empty checklist blocks the seal.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <caption className="sr-only">Coverage of each checklist item</caption>
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  #
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Checklist item
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  State
                </th>
                <th scope="col" className="py-2 font-medium">
                  Evidence
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.checklistItemId} className="border-b border-line align-top" data-testid="coverage-row">
                  <td className="py-2 pr-3 text-muted">{i + 1}</td>
                  <td className="py-2 pr-3">{label.get(row.checklistItemId)?.label ?? row.checklistItemId}</td>
                  <td className="py-2 pr-3">
                    <CoverageStateLabel state={row.state} />
                    {actions && row.state === "uncovered" ? (
                      <RequestReshoot
                        itemLabel={label.get(row.checklistItemId)?.label ?? row.checklistItemId}
                        busy={actions.updatingId === `new:${row.checklistItemId}`}
                        locked={actions.updatingId !== undefined}
                        error={
                          actions.error?.reshootId === `new:${row.checklistItemId}` ? actions.error.message : undefined
                        }
                        onRequest={(note) => actions.onRequestReshoot(row.checklistItemId, note)}
                      />
                    ) : null}
                  </td>
                  <td className="py-2 text-muted">
                    {row.evidenceIds.length} {row.evidenceIds.length === 1 ? "candidate" : "candidates"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
