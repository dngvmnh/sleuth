"use client";

import { LanternIcon } from "@/components/icons";
import type { ApiClient } from "@/lib/api-client";
import { useOpenFindings } from "./use-open-findings";

/**
 * "7 open": the real number of open findings across the visitor's projects. Shows nothing
 * while counting or when any count failed, so it never shows a made-up number.
 */
export function OpenFindingsChip({ refreshKey, client }: { refreshKey: string; client?: ApiClient }) {
  const total = useOpenFindings(refreshKey, client);
  if (total.state !== "ready") return null;
  return (
    <p
      data-testid="open-findings-chip"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-[2px] border border-line px-2 py-1 text-xs text-foreground"
    >
      <LanternIcon size={16} className="text-primary" />
      <span className="tabular-nums">{total.count} open</span>
      <span className="sr-only"> {total.count === 1 ? "finding" : "findings"} across your projects</span>
    </p>
  );
}
