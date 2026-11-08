import { FINDING_LABELS, type EvidenceCandidate, type Finding } from "@sleuth/contracts";

export type StaleReason = "script_changed" | "video_replaced";

/**
 * One Poltergeist finding per stale evidence candidate. Ids are stable, so reruns do not duplicate.
 * `reason` says what made the evidence stale so the explanation can name it.
 */
export function buildPoltergeistFindings(
  stale: readonly EvidenceCandidate[],
  analysisRunId: string,
  reason: StaleReason = "script_changed",
): Finding[] {
  const found =
    reason === "video_replaced"
      ? "Evidence was matched against an earlier version of the video."
      : "Evidence was matched earlier for this script line before the line was edited or removed.";
  return stale
    .filter((e) => e.status === "stale")
    .map((e) => ({
      id: `fd-poltergeist-${e.id}`,
      projectId: e.projectId,
      type: "poltergeist" as const,
      plainLabel: FINDING_LABELS.poltergeist.plain,
      checklistItemId: e.checklistItemId,
      scriptSegmentId: e.scriptSegmentId,
      evidenceId: e.id,
      found,
      notFound: "No check has run against the current script text or video yet.",
      limits:
        reason === "video_replaced"
          ? "Every candidate on the old video is out of date. Re-run analysis to check the new video."
          : "Only that line's evidence is marked out of date. Re-run analysis on it to get a new candidate.",
      status: "open" as const,
      analysisRunId,
    }));
}

/**
 * Marks Poltergeist findings `resolved` when their evidence has been replaced by a new analysis.
 * Other findings, and Poltergeist findings for evidence that was not replaced, are returned as they are.
 */
export function resolvePoltergeists(
  findings: readonly Finding[],
  replacedEvidenceIds: readonly string[],
): Finding[] {
  const replaced = new Set(replacedEvidenceIds);
  return findings.map((f) =>
    f.type === "poltergeist" &&
    f.evidenceId !== null &&
    replaced.has(f.evidenceId) &&
    f.status !== "resolved"
      ? { ...f, status: "resolved" as const }
      : f,
  );
}
