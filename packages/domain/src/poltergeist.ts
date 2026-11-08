import { FINDING_LABELS, type EvidenceCandidate, type Finding } from "@sleuth/contracts";

/** One Poltergeist finding per stale evidence candidate. Ids are stable, so reruns do not duplicate. */
export function buildPoltergeistFindings(
  stale: readonly EvidenceCandidate[],
  analysisRunId: string,
): Finding[] {
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
      found: "Evidence was matched earlier for this script line and video.",
      notFound: "No check has run against the current script text or video yet.",
      limits:
        "Only that line's evidence is marked out of date. Re-run analysis on it to get a new candidate.",
      status: "open" as const,
      analysisRunId,
    }));
}
