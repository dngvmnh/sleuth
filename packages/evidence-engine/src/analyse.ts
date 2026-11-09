import {
  FINDING_LABELS,
  type ChecklistItem,
  type Confidence,
  type EvidenceCandidate,
  type Finding,
  type FindingType,
  type FrameObservation,
  type ScriptSegment,
  type TranscriptSegment,
} from "@sleuth/contracts";
import { align, type AlignmentResult } from "./align";
import { CHECKLIST_MIN_COVERAGE, FRAME_WINDOW_MS, SPOKEN_STRONG_COVERAGE } from "./thresholds";
import { contentTokens, coverage, formatMs, needsOutsideProof } from "./text";

export interface EngineInput {
  projectId: string;
  assetVersionId: string;
  durationMs: number;
  analysisRunId: string;
  segments: readonly ScriptSegment[];
  checklist: readonly ChecklistItem[];
  transcript: readonly TranscriptSegment[];
  observations: readonly FrameObservation[];
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

  for (const segment of input.segments) {
    const segTokens = contentTokens(segment.text);

    // 1. Was the line spoken? (`align` decides, one spoken segment per line.)
    const aligned = alignedBySegment.get(segment.id);
    const matchedSeg = aligned?.transcriptId ? transcriptById.get(aligned.transcriptId) : undefined;
    const spoken: { seg: TranscriptSegment; score: number } | null =
      aligned && matchedSeg ? { seg: matchedSeg, score: aligned.coverage } : null;

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

    const outsideProof = needsOutsideProof(segment.text);

    if (!spoken) {
      findings.push(
        finding(input, "phantom_dialogue", segment.id, {
          scriptSegmentId: segment.id,
          checklistItemId: item?.id ?? null,
          found: "The script line exists.",
          notFound: "No spoken sentence in the transcript covers enough of its words.",
          limits:
            "Speech to text can miss words, and the presenter may have said it differently. Listen to the clip.",
        }),
      );
    }
    if (outsideProof) {
      if (item) checklistHasOutsideProof.add(item.id);
      findings.push(
        finding(input, "needs_outside_proof", segment.id, {
          scriptSegmentId: segment.id,
          checklistItemId: item?.id ?? null,
          found: "The script makes a claim about security, guarantees or compliance.",
          notFound: "Footage cannot show this. No visual check was attempted.",
          limits: "Needs a document, certificate or other proof from outside the video.",
        }),
      );
    }
    if (!spoken) continue;

    // 3. What was on screen while it was said?
    const from = spoken.seg.startMs - FRAME_WINDOW_MS;
    const to = spoken.seg.endMs + FRAME_WINDOW_MS;
    const near = outsideProof
      ? []
      : input.observations.filter((o) => o.timestampMs >= from && o.timestampMs <= to);
    const matched = near
      .map((o) => ({
        o,
        score: segTokens.filter((t) =>
          contentTokens(`${o.description} ${o.onScreenText.join(" ")}`).includes(t),
        ).length,
      }))
      .filter((m) => m.score >= 1);
    const bestScore = Math.max(0, ...matched.map((m) => m.score));

    if (!outsideProof && matched.length === 0) continue;

    const times = [spoken.seg.startMs, spoken.seg.endMs, ...matched.map((m) => m.o.timestampMs)];
    const startMs = clamp(Math.min(...times), input.durationMs);
    const endMs = clamp(Math.max(...times), input.durationMs);

    let confidence: Confidence = "low";
    if (!outsideProof) {
      confidence = spoken.score >= SPOKEN_STRONG_COVERAGE && bestScore >= 2 ? "high" : "medium";
    }

    const spokenNote = `Spoken at ${formatMs(spoken.seg.startMs)}-${formatMs(spoken.seg.endMs)} (${Math.round(spoken.score * 100)}% of the line's key words).`;
    const orderNote = aligned?.label === "reordered" ? " It was spoken out of the script's order." : "";
    const explanation = outsideProof
      ? `${spokenNote}${orderNote} This claim cannot be proven by footage, so it needs proof from outside the video.`
      : `${spokenNote}${orderNote} ${matched.length} nearby frame${matched.length === 1 ? "" : "s"} share${matched.length === 1 ? "s" : ""} up to ${bestScore} key word${bestScore === 1 ? "" : "s"} with the line. Confidence ranks this match; a person must confirm it.`;

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
      transcriptSegmentIds: [spoken.seg.id],
      frameObservationIds: matched.map((m) => m.o.id),
      explanation,
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
          found:
            matched.length === 1
              ? "1 frame near the spoken line shares words with it."
              : `${matched.length} frames near the spoken line share words with it.`,
          notFound: "Not every key word of the line was seen on screen.",
          limits: "Matching compares words only. Watch the clip to confirm it shows the step.",
        }),
      );
    }
  }

  for (const c of input.checklist) {
    if (checklistHasVisual.has(c.id) || checklistHasOutsideProof.has(c.id)) continue;
    findings.push(
      finding(input, "ghost", c.id, {
        checklistItemId: c.id,
        found: checklistHasLine.has(c.id)
          ? "A script line points at this item."
          : "No script line points at this item.",
        notFound: "No frame near a matching spoken line shows it.",
        limits:
          "Frames are sampled, so a quick action between samples can be missed. Scrub the video to check.",
      }),
    );
  }

  return { evidence, findings, alignment };
}
