"use client";

import { useEffect, useState } from "react";
import type { EvidenceCandidate, Finding, ProcessingJob } from "@sleuth/contracts";
import { ProcessingState } from "@/components/state-panel";
import { Button } from "@/components/ui/button";
import { useJobPoll } from "./use-job-poll";

export interface AnalysisPanelProps {
  readOnly: boolean;
  evidence: readonly EvidenceCandidate[];
  findings: readonly Finding[];
  startAnalysis: () => Promise<ProcessingJob>;
  fetchJob: (jobId: string) => Promise<ProcessingJob>;
  /** Reload evidence and findings after a job succeeds. */
  onSucceeded: () => void | Promise<void>;
  intervalMs?: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The analysis could not be started.";
}

/** A job that has waited this long in the queue gets a clear message (WP6). */
export const STALLED_AFTER_MS = 30 * 60_000;

const STATUS_TEXT: Record<"queued" | "running", string> = {
  queued: "Queued. Analysis starts within about 10 to 15 minutes.",
  running: "Analysis running.",
};

/** Items a person still has to look at: AI candidates not yet decided, and open findings. */
function needsPerson(evidence: readonly EvidenceCandidate[], findings: readonly Finding[]) {
  return {
    candidates: evidence.filter((e) => e.status === "candidate" || e.status === "needs_outside_proof").length,
    openFindings: findings.filter((f) => f.status === "open").length,
  };
}

/**
 * Start an analysis job and follow it: processing (status and attempt), failed (the job's
 * error and Try again, which starts a new job) and done (what still needs a person).
 */
export function AnalysisPanel({
  readOnly,
  evidence,
  findings,
  startAnalysis,
  fetchJob,
  onSucceeded,
  intervalMs,
}: AnalysisPanelProps) {
  const { job, checkError, watch } = useJobPoll({ fetchJob, onSucceeded, intervalMs });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | undefined>(undefined);
  const active = job !== null && (job.status === "queued" || job.status === "running");
  // The clock is read in a timer callback, not during render, so render stays pure.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active, job]);

  const start = async () => {
    if (starting || active || readOnly) return;
    setStarting(true);
    setStartError(undefined);
    try {
      watch(await startAnalysis());
    } catch (e: unknown) {
      setStartError(messageOf(e));
    } finally {
      setStarting(false);
    }
  };

  const counts = needsPerson(evidence, findings);

  return (
    <section aria-labelledby="analysis-heading" className="rounded-md border border-line bg-surface p-4">
      <h2 id="analysis-heading" className="font-display text-lg text-foreground">
        Analysis
      </h2>
      <p className="mt-1 text-sm text-muted">
        Matches the script and checklist against the current video. Every match it finds is a candidate for a
        person to check.
      </p>

      <p className="mt-2 text-xs text-muted" data-testid="analysis-limits">
        Free-tier limits: a video up to 50 MB and 3 minutes, and a small number of analyses per account each day
        (5 by default). If you reach the limit, this page tells you when it resets.
      </p>

      {readOnly ? (
        <p className="mt-3 text-sm text-muted">The demo is read-only. Make an editable copy to run an analysis.</p>
      ) : job === null || job.status === "succeeded" ? (
        <Button className="mt-3" size="sm" disabled={starting} onClick={() => void start()}>
          {starting ? "Starting..." : job === null ? "Run analysis" : "Run analysis again"}
        </Button>
      ) : null}

      <div className="mt-3" aria-live="polite">
        {job && active ? (
          <div data-testid="job-processing">
            <ProcessingState
              statusText={`${STATUS_TEXT[job.status as "queued" | "running"]} Attempt ${job.attempts} of ${job.maxAttempts}.`}
            />
            <p className="mt-2 text-xs text-muted">
              The real job state is checked every 2 seconds. You can leave this page and come back; the result
              is kept. If no worker is running (fixture mode in the web app has none), the job stays queued.
            </p>
          </div>
        ) : null}
        {job && job.status === "queued" && now > 0 && now - Date.parse(job.createdAt) > STALLED_AFTER_MS ? (
          <p role="alert" data-testid="job-stalled" className="mt-3 text-sm text-warn">
            This job has waited more than 30 minutes. The worker may be late or stopped. You can keep waiting, or
            come back later: the job is kept. If it is still queued after an hour, tell the team.
          </p>
        ) : null}
        {job && job.status === "succeeded" ? (
          <div role="status" data-testid="job-done" className="rounded-md border border-line p-3 text-sm">
            <p className="font-medium text-foreground">Analysis done.</p>
            <p className="mt-1 text-muted">
              Still needs a person: {counts.candidates} evidence{" "}
              {counts.candidates === 1 ? "candidate" : "candidates"} to confirm or reject, and{" "}
              {counts.openFindings} open {counts.openFindings === 1 ? "finding" : "findings"}.
            </p>
          </div>
        ) : null}
      </div>

      {job && job.status === "failed" ? (
        <div role="alert" data-testid="job-failed" className="mt-3 text-sm">
          <p className="font-medium text-danger">The analysis failed after {job.attempts} of {job.maxAttempts} attempts.</p>
          <p className="mt-1 text-muted">{job.error ?? "No error text was given."}</p>
          <Button className="mt-2" size="sm" variant="outline" disabled={starting} onClick={() => void start()}>
            {starting ? "Starting..." : "Try again"}
          </Button>
        </div>
      ) : null}
      {checkError && active ? (
        <p className="mt-2 text-sm text-warn">Could not check the job: {checkError} Trying again in 2 seconds.</p>
      ) : null}
      {startError ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {startError}
        </p>
      ) : null}
    </section>
  );
}
