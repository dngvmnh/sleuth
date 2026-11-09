import {
  FINDING_LABELS,
  type ChecklistItem,
  type EvidenceCandidate,
  type Finding,
  type FindingType,
  type FrameObservation,
  type ScriptSegment,
  type TranscriptSegment,
} from "@sleuth/contracts";
import { align, type AlignmentResult } from "./align";
import {
  explainCursedFrame,
  explainEvidence,
  explainGhost,
  explainNeedsOutsideProof,
  explainPhantomDialogue,
} from "./explain";
import { bestSharedWords, matchFrames, rankConfidence } from "./match";
import { contentTokens, coverage, needsOutsideProof } from "./text";
import { CHECKLIST_MIN_COVERAGE } from "./thresholds";

export interface EngineInput {
  projectId: string;
  assetVersionId: string;
  durationMs: number;
  analysisRunId: string;
  segments: readonly ScriptSegment[];
  checklist: readonly ChecklistItem[];
  transcript: readonly TranscriptSegment[];
  observations: readonly FrameObservation[];
  /**
   * Analyse only these script lines (a re-analysis). The lines are still aligned against the whole
   * script, so a targeted result equals the same lines of a full run. Omit for a full run.
   */
  segmentIds?: readonly string[];
  /**
   * Evidence already stored for the project. A targeted run reads it to tell whether a checklist
   * item is still served by a line it did not analyse. Ignored on a full run.
   */
  existingEvidence?: readonly EvidenceCandidate[];
}

export interface EngineOutput {
  evidence: EvidenceCandidate[];
  findings: Finding[];
  /** How each script line lines up with the speech, and which spoken lines no script line uses. */
  alignment: AlignmentResult;
}

const clamp = (n: number, max: number) => Math.min(Math.max(Math.round(n), 0), max);

function finding(
  input: EngineInput,
  type: FindingType,
  key: string,
  parts: Pick<Finding, "found" | "notFound" | "limits"> &
    Partial<Pick<Finding, "checklistItemId" | "scriptSegmentId" | "evidenceId">>,
): Finding {
  return {
    id: `fd-${type.replace(/_/g, "-")}-${key}`,
    projectId: input.projectId,
    type,
    plainLabel: FINDING_LABELS[type].plain,
    checklistItemId: parts.checklistItemId ?? null,
    scriptSegmentId: parts.scriptSegmentId ?? null,
    evidenceId: parts.evidenceId ?? null,
    found: parts.found,
    notFound: parts.notFound,
    limits: parts.limits,
    status: "open",
    analysisRunId: input.analysisRunId,
  };
}

/**
 * Deterministic matching of script lines to speech and to frames. Everything it returns is a
 * candidate: nothing is ever `confirmed` here. Confidence ranks matches; it does not prove them.
 */
export function analyse(input: EngineInput): EngineOutput {
  const evidence: EvidenceCandidate[] = [];
  const findings: Finding[] = [];
  const checklistHasVisual = new Set<string>();
  const checklistHasOutsideProof = new Set<string>();
  const checklistHasLine = new Set<string>();
  const alignment = align(input.segments, input.transcript);
  const alignedBySegment = new Map(alignment.aligned.map((a) => [a.segmentId, a]));
  const transcriptById = new Map(input.transcript.map((t) => [t.id, t]));
  const wanted = input.segmentIds ? new Set(input.segmentIds) : null;

  for (const segment of input.segments) {
    const segTokens = contentTokens(segment.text);

    // 1. Was the line spoken? (`align` decides, one spoken segment per line.)
    const aligned = alignedBySegment.get(segment.id);
    const spokenSeg = aligned?.transcriptId ? transcriptById.get(aligned.transcriptId) : undefined;

    // 2. Which checklist item does the line serve?
    let item: ChecklistItem | null = null;
    let itemScore = 0;
    for (const c of input.checklist) {
      const score = coverage(contentTokens(c.label), segTokens);
      if (score >= CHECKLIST_MIN_COVERAGE && score > itemScore) {
        item = c;
        itemScore = score;
      }
    }
    if (item) checklistHasLine.add(item.id);
    if (wanted && !wanted.has(segment.id)) {
      // A claim on a line we skip still covers its checklist item; that needs only the text.
      if (item && needsOutsideProof(segment.text)) checklistHasOutsideProof.add(item.id);
      continue;
    }

    const outsideProof = needsOutsideProof(segment.text);

    if (!aligned || !spokenSeg) {
      findings.push(
        finding(input, "phantom_dialogue", segment.id, {
          scriptSegmentId: segment.id,
          checklistItemId: item?.id ?? null,
          ...explainPhantomDialogue(),
        }),
      );
    }
    if (outsideProof) {
      if (item) checklistHasOutsideProof.add(item.id);
      findings.push(
        finding(input, "needs_outside_proof", segment.id, {
          scriptSegmentId: segment.id,
          checklistItemId: item?.id ?? null,
          ...explainNeedsOutsideProof(),
        }),
      );
    }
    if (!aligned || !spokenSeg) continue;

    // 3. What was on screen while it was said? Claims footage cannot prove get no frames.
    const matches = outsideProof ? [] : matchFrames(segTokens, spokenSeg, input.observations);
    if (!outsideProof && matches.length === 0) continue;

    const times = [
      spokenSeg.startMs,
      spokenSeg.endMs,
      ...matches.map((m) => m.observation.timestampMs),
    ];
    const startMs = clamp(Math.min(...times), input.durationMs);
    const endMs = clamp(Math.max(...times), input.durationMs);
    const confidence = rankConfidence({ outsideProof, label: aligned.label, matches });

    const ev: EvidenceCandidate = {
      id: `ev-${segment.id}-${input.assetVersionId}`,
      projectId: input.projectId,
      checklistItemId: item?.id ?? null,
      scriptSegmentId: segment.id,
      scriptVersionId: segment.scriptVersionId,
      segmentHash: segment.hash,
      assetVersionId: input.assetVersionId,
      startMs,
      endMs,
      transcriptSegmentIds: [spokenSeg.id],
      frameObservationIds: matches.map((m) => m.observation.id),
      explanation: explainEvidence({
        startMs: spokenSeg.startMs,
        endMs: spokenSeg.endMs,
        coverage: aligned.coverage,
        label: aligned.label,
        outsideProof,
        matchedFrames: matches.length,
        bestSharedWords: bestSharedWords(matches),
      }),
      confidence,
      status: outsideProof ? "needs_outside_proof" : "candidate",
      source: "ai",
      analysisRunId: input.analysisRunId,
    };
    evidence.push(ev);
    if (item && !outsideProof) checklistHasVisual.add(item.id);

    if (!outsideProof && confidence !== "high") {
      findings.push(
        finding(input, "cursed_frame", segment.id, {
          scriptSegmentId: segment.id,
          checklistItemId: item?.id ?? null,
          evidenceId: ev.id,
          ...explainCursedFrame({ matchedFrames: matches.length }),
        }),
      );
    }
  }

  // A targeted run did not look at the other lines: stored evidence says what they still cover.
  // Without it a targeted run cannot tell, so it raises no Ghost findings at all.
  if (wanted && input.existingEvidence) {
    for (const e of input.existingEvidence) {
      if (wanted.has(e.scriptSegmentId) || e.checklistItemId === null) continue;
      if (e.status === "needs_outside_proof") checklistHasOutsideProof.add(e.checklistItemId);
      else if (
        (e.status === "candidate" || e.status === "confirmed") &&
        e.frameObservationIds.length > 0
      )
        checklistHasVisual.add(e.checklistItemId);
    }
  }

  for (const c of wanted && !input.existingEvidence ? [] : input.checklist) {
    if (checklistHasVisual.has(c.id) || checklistHasOutsideProof.has(c.id)) continue;
    findings.push(
      finding(input, "ghost", c.id, {
        checklistItemId: c.id,
        ...explainGhost({ lineExists: checklistHasLine.has(c.id) }),
      }),
    );
  }

  return { evidence, findings, alignment };
}
