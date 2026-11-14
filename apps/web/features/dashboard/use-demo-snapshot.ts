"use client";

import { useEffect, useMemo, useState } from "react";
import type { EvidenceCandidate, Finding, FindingType, ScriptSegment } from "@sleuth/contracts";
import { useApiClient } from "@/components/guest-auth-provider";
import type { ApiClient } from "@/lib/api-client";

/** One real open finding from the demo, ready for the hero's clue card. */
export interface DemoClue {
  findingId: string;
  type: FindingType;
  /** 1-based script line, when the finding is about a line. */
  line: number | null;
  segmentId: string | null;
  /** Where its evidence starts in the video, when it has evidence. */
  startMs: number | null;
  /** The script line, or what was not found. One line only. */
  excerpt: string;
}

export interface DemoSnapshot {
  state: "loading" | "ready" | "none";
  demoId: string | null;
  /** Checklist items a person proved, out of all checklist items. Null when unknown. */
  proven: { done: number; total: number } | null;
  clue: DemoClue | null;
}

const NONE: DemoSnapshot = { state: "none", demoId: null, proven: null, clue: null };

/**
 * The clue card shows one open finding. The API gives findings no time stamp, so "newest" is
 * not known; this takes the first open finding tied to a script line, in the API's order, and
 * falls back to the first open finding of any kind.
 */
export function pickClue(
  findings: readonly Finding[],
  evidence: readonly EvidenceCandidate[],
  segments: readonly ScriptSegment[],
): DemoClue | null {
  const open = findings.filter((f) => f.status === "open");
  const chosen = open.find((f) => f.scriptSegmentId !== null) ?? open[0];
  if (!chosen) return null;
  const segment = segments.find((s) => s.id === chosen.scriptSegmentId);
  const ev = evidence.find((e) => e.id === chosen.evidenceId);
  return {
    findingId: chosen.id,
    type: chosen.type,
    line: segment ? segment.index + 1 : null,
    segmentId: segment?.id ?? null,
    startMs: ev ? ev.startMs : null,
    excerpt: segment?.text ?? chosen.notFound,
  };
}

/** `m:ss` for a time in the video. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Loads the public demo's real coverage and one open finding. Any failure shows nothing. */
export function useDemoSnapshot(client?: ApiClient): DemoSnapshot {
  const shared = useApiClient();
  const api = useMemo(() => client ?? shared, [client, shared]);
  const [snapshot, setSnapshot] = useState<DemoSnapshot>({ ...NONE, state: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { projects } = await api.listProjects();
      const demo = projects.find((p) => p.isDemo);
      if (!demo) return NONE;
      const [coverage, findings, evidence, detail] = await Promise.all([
        api.getCoverage(demo.id).catch(() => null),
        api.listFindings(demo.id),
        api.listEvidence(demo.id),
        api.getProject(demo.id),
      ]);
      const total = coverage ? coverage.coverage.items.length : 0;
      return {
        state: "ready",
        demoId: demo.id,
        proven: coverage && total > 0 ? { done: coverage.coverage.totals.proven, total } : null,
        clue: pickClue(findings.findings, evidence.evidence, detail.scriptVersion?.segments ?? []),
      } satisfies DemoSnapshot;
    })()
      .then((next) => {
        if (!cancelled) setSnapshot(next);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(NONE);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return snapshot;
}
