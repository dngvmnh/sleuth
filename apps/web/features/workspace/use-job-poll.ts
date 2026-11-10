"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessingJob } from "@sleuth/contracts";

export const POLL_INTERVAL_MS = 2000;

export function isActive(job: ProcessingJob | null): boolean {
  return job !== null && (job.status === "queued" || job.status === "running");
}

export interface JobPollOptions {
  fetchJob: (jobId: string) => Promise<ProcessingJob>;
  /** Called once when the watched job reaches `succeeded`. */
  onSucceeded?: (job: ProcessingJob) => void | Promise<void>;
  intervalMs?: number;
}

export interface JobPollState {
  job: ProcessingJob | null;
  /** Set when the last check failed; polling goes on. */
  checkError: string | undefined;
  /** Start watching a job (for example the one `startAnalysis` returned). Replaces any job watched before. */
  watch: (job: ProcessingJob) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The job could not be checked.";
}

/**
 * Polls one job every `intervalMs` while it is `queued` or `running`, and stops at
 * `succeeded` or `failed`, on `watch` of another job, or on unmount.
 *
 * The next check is scheduled only after the previous answer arrives, so checks never
 * overlap. Each watch gets a generation number; an answer for an older generation is dropped.
 */
export function useJobPoll({ fetchJob, onSucceeded, intervalMs = POLL_INTERVAL_MS }: JobPollOptions): JobPollState {
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [checkError, setCheckError] = useState<string | undefined>(undefined);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Keep the latest callbacks without restarting the poll when they change identity.
  const latest = useRef({ fetchJob, onSucceeded });
  useEffect(() => {
    latest.current = { fetchJob, onSucceeded };
  });

  const clear = () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  };

  const schedule = useCallback(
    (jobId: string, gen: number) => {
      const next = () => {
        clear();
        timer.current = setTimeout(() => {
          timer.current = undefined;
          latest.current
            .fetchJob(jobId)
            .then((fresh) => {
              if (gen !== generation.current) return;
              setJob(fresh);
              setCheckError(undefined);
              if (isActive(fresh)) next();
              else if (fresh.status === "succeeded") void latest.current.onSucceeded?.(fresh);
            })
            .catch((error: unknown) => {
              if (gen !== generation.current) return;
              setCheckError(messageOf(error));
              next();
            });
        }, intervalMs);
      };
      next();
    },
    [intervalMs],
  );

  const watch = useCallback(
    (next: ProcessingJob) => {
      generation.current += 1;
      clear();
      setJob(next);
      setCheckError(undefined);
      if (isActive(next)) schedule(next.id, generation.current);
      else if (next.status === "succeeded") void latest.current.onSucceeded?.(next);
    },
    [schedule],
  );

  useEffect(
    () => () => {
      // Leaving the workspace: stop polling and ignore any answer still on its way.
      generation.current += 1;
      clear();
    },
    [],
  );

  return { job, checkError, watch };
}
