"use client";

import type { ReactNode } from "react";
import type { EvidenceCandidate, Finding, FindingType, ScriptSegment } from "@sleuth/contracts";
import { FindingBadge } from "@/components/finding-badge";
import { Button } from "@/components/ui/button";
import { formatSeconds } from "../timeline/markers";

/** Used only when no finding gives the three parts for this candidate. */
const GENERAL_LIMITS =
  "This is an automatic match on spoken words and sampled frames. It can be wrong or miss a step. Watch the clip to check it.";

const OUTSIDE_PROOF_KIND =
  "Needs proof from outside the video, such as a document, certificate or other record.";

function statusBadge(status: EvidenceCandidate["status"]): { type: FindingType | null; text: string } {
  switch (status) {
    case "candidate":
      return { type: "cursed_frame", text: "A candidate. A person has not reviewed it yet." };
    case "stale":
      return { type: "poltergeist", text: "Out of date. The script or video changed after this was found." };
    case "needs_outside_proof":
      return { type: "needs_outside_proof", text: "A candidate that footage cannot prove." };
    case "confirmed":
      return { type: null, text: "Confirmed by a person." };
    case "rejected":
      return { type: null, text: "Rejected by a person." };
    case "needs_reshoot":
      return { type: null, text: "A person asked for a reshoot." };
  }
}

/** The finding that belongs to this evidence: linked by id, else the outside-proof finding on the same line. */
function findingForEvidence(evidence: EvidenceCandidate, findings: readonly Finding[]): Finding | undefined {
  const linked = findings.find((f) => f.evidenceId === evidence.id);
  if (linked) return linked;
  if (evidence.status === "needs_outside_proof") {
    return findings.find(
      (f) => f.type === "needs_outside_proof" && f.scriptSegmentId === evidence.scriptSegmentId,
    );
  }
  return undefined;
}

function ThreeParts({ found, notFound, limits }: { found: string; notFound: string; limits: string }) {
  return (
    <dl className="mt-3 space-y-2 text-sm">
      <div>
        <dt className="font-medium text-foreground">What was found</dt>
        <dd className="text-muted">{found}</dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">What was not found</dt>
        <dd className="text-muted">{notFound}</dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">Limits of this check</dt>
        <dd className="text-muted">{limits}</dd>
      </div>
    </dl>
  );
}

function FindingBlock({ finding }: { finding: Finding }) {
  return (
    <div className="mt-4 rounded-md border border-line p-3">
      <FindingBadge type={finding.type} />
      {finding.status === "resolved" ? <span className="ml-2 text-xs text-muted">Resolved</span> : null}
      <ThreeParts found={finding.found} notFound={finding.notFound} limits={finding.limits} />
    </div>
  );
}

export interface LanternProps {
  /** The selected script line, if any. */
  segment: ScriptSegment | undefined;
  /** The selected evidence for that line, if it has any. */
  evidence: EvidenceCandidate | undefined;
  /** Findings of the project. The panel picks the ones for this line. */
  findings: readonly Finding[];
  onPlayPart: (startMs: number, endMs: number) => void;
  /** Review actions for the selected evidence (task 10). Omitted: the panel is read-only. */
  actions?: ReactNode;
}

/**
 * Evidence Lantern: what was found for the selected line or marker, what was not, and the
 * limits. It is a side panel, not a modal. AI output is described as a candidate; the word
 * "Confirmed" appears only for evidence a person confirmed. Review actions arrive through the `actions` slot.
 */
export function Lantern({ segment, evidence, findings, onPlayPart, actions }: LanternProps) {
  const heading = (text: string) => (
    <h2 id="lantern-heading" className="font-display text-lg text-foreground">
      {text}
    </h2>
  );

  if (!segment) {
    return (
      <section aria-labelledby="lantern-heading" className="rounded-md border border-line bg-surface p-4">
        {heading("Evidence Lantern")}
        <p className="mt-2 text-sm text-muted">
          Select a marker on the timeline or a line of the script to see its evidence here.
        </p>
      </section>
    );
  }

  const line = segment.index + 1;
  const lineFindings = findings.filter((f) => f.scriptSegmentId === segment.id);

  if (!evidence) {
    return (
      <section aria-labelledby="lantern-heading" className="rounded-md border border-line bg-surface p-4">
        {heading(`Line ${line}: no evidence`)}
        <p className="mt-2 text-sm text-muted">{segment.text}</p>
        <div className="mt-3">
          <FindingBadge type="ghost" />
        </div>
        <p className="mt-3 text-sm text-muted">
          No evidence candidate exists for this line, so the clock did not move.
        </p>
        {lineFindings.length === 0 ? (
          <ThreeParts
            found="No evidence candidate for this line."
            notFound="No matching footage or speech was linked to it."
            limits="The check only covers the uploaded video and its transcript. A missing match does not prove the step is absent."
          />
        ) : (
          lineFindings.map((f) => <FindingBlock key={f.id} finding={f} />)
        )}
      </section>
    );
  }

  const badge = statusBadge(evidence.status);
  const own = findingForEvidence(evidence, findings);
  const others = lineFindings.filter((f) => f.id !== own?.id);

  return (
    <section aria-labelledby="lantern-heading" className="rounded-md border border-line bg-surface p-4">
      {heading(`Evidence for line ${line}`)}
      <p className="mt-2 text-sm text-muted">{segment.text}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {badge.type ? <FindingBadge type={badge.type} /> : null}
        <span className="text-sm text-muted">{badge.text}</span>
      </div>

      <h3 className="mt-4 text-sm font-medium text-foreground">Explanation</h3>
      <p className="mt-1 text-sm text-muted">{evidence.explanation}</p>

      {evidence.status === "needs_outside_proof" ? (
        <div role="note" className="mt-4 rounded-md border border-warn p-3 text-sm">
          <p className="font-medium text-foreground">Footage cannot prove this.</p>
          <p className="mt-1 text-muted">{own?.limits ?? OUTSIDE_PROOF_KIND}</p>
        </div>
      ) : null}

      <ThreeParts
        found={own?.found ?? `A candidate match for this line from ${formatSeconds(evidence.startMs)} s to ${formatSeconds(evidence.endMs)} s.`}
        notFound={own?.notFound ?? "No problem was raised for this candidate. That does not mean it is right."}
        limits={own?.limits ?? GENERAL_LIMITS}
      />

      <p className="mt-4 text-sm text-muted">
        Confidence: <span className="font-medium text-foreground">{evidence.confidence}</span>. A ranking, not proof.
      </p>
      <p className="mt-1 text-sm text-muted">
        Time range: {formatSeconds(evidence.startMs)} s to {formatSeconds(evidence.endMs)} s
      </p>

      <Button
        className="mt-4"
        variant="outline"
        onClick={() => onPlayPart(evidence.startMs, evidence.endMs)}
      >
        Play this part
      </Button>

      {actions}

      {others.map((f) => (
        <FindingBlock key={f.id} finding={f} />
      ))}
    </section>
  );
}
