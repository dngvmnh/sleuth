"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import type {
  CoverageSummary,
  Finding,
  GetProjectResponseSchema,
  ReshootTask,
  Seal,
  SealBlocker,
} from "@sleuth/contracts";
import { useApiClient } from "@/components/guest-auth-provider";
import { ApiClientError, sealBlockersOf, type ApiClient } from "@/lib/api-client";

export type ReportStatus = "loading" | "error" | "not_found" | "done";

/** Project, checklist and script: the report needs the name and the checklist labels. */
export type ReportProject = z.infer<typeof GetProjectResponseSchema>;

export interface ReportData {
  project: ReportProject;
  coverage: CoverageSummary;
  /** The latest seal, active or broken. Null if the project was never sealed. */
  seal: Seal | null;
  /** Why sealing is refused right now. Empty means the server would allow it. */
  blockers: SealBlocker[];
  findings: Finding[];
  reshoots: ReshootTask[];
}

export interface ReportState {
  status: ReportStatus;
  data: ReportData | undefined;
  errorMessage: string | undefined;
  /** Load everything again, showing the loading state. */
  reload: () => void;
  /**
   * Whether this viewer may change the project. The frontend has no current-user id, so this
   * uses the read rule: a non-demo project is only readable by its owner, and the demo is
   * read-only for everyone. The server checks again on every write.
   */
  canManage: boolean;
  /** Id of the reshoot whose update is running, if any. One at a time. */
  updatingReshootId: string | undefined;
  /** Server text from the last failed reshoot update, with the reshoot it belongs to. */
  reshootError: { reshootId: string; message: string } | undefined;
  /**
   * Mark a reshoot done (or open again). On success reshoots and coverage are reloaded from
   * the API; the page never changes a coverage state itself. Resolves true on success.
   */
  updateReshoot: (reshootId: string, status: ReshootTask["status"]) => Promise<boolean>;
  /**
   * Ask for a reshoot of a checklist item that has no usable footage (a Ghost item). Shares the
   * one-at-a-time guard with `updateReshoot`; while it runs `updatingReshootId` is `new:<itemId>`,
   * and a failure is reported in `reshootError` under the same key. Reloads reshoots and coverage.
   */
  requestReshoot: (checklistItemId: string, note: string) => Promise<boolean>;
  /**
   * Apply the Final Seal: a person's sign-off, called only from their explicit confirm step.
   * One request at a time. On success the coverage, seal and blockers are reloaded from the API.
   * A `409 seal_blocked` comes back as `blocked` with the server's blockers.
   */
  seal: (note: string) => Promise<SealResult>;
}

export type SealResult =
  | { kind: "sealed"; seal: Seal }
  | { kind: "blocked"; blockers: SealBlocker[]; message: string }
  | { kind: "failed"; message: string }
  /** Another seal request is running, or the page moved on; nothing was sent or shown. */
  | { kind: "ignored" };

interface Loaded {
  projectId: string;
  attempt: number;
  status: ReportStatus;
  data: ReportData | undefined;
  errorMessage: string | undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The report could not be loaded.";
}

/**
 * Loads what the Final Seal report shows: project detail, coverage with the seal and the
 * current blockers, findings and reshoots, all through the typed client and checked by the
 * contract schemas. Writes: `updateReshoot`, and `seal`, which only a person's confirm step calls.
 *
 * A response for an earlier project, an earlier attempt, or after unmount is dropped, and the
 * old project's data is never shown while a new id loads.
 */
export function useReport(projectId: string, client?: ApiClient): ReportState {
  const sharedClient = useApiClient();
  const api = useMemo(() => client ?? sharedClient, [client, sharedClient]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Loaded>({
    projectId,
    attempt: 0,
    status: "loading",
    data: undefined,
    errorMessage: undefined,
  });

  const [updatingReshootId, setUpdatingReshootId] = useState<string | undefined>(undefined);
  const [reshootError, setReshootError] = useState<ReportState["reshootError"]>(undefined);
  // The project and load the screen is on; async work checks this before writing.
  const live = useRef({ projectId, attempt: 0, mounted: false });
  const updating = useRef(false);
  const sealing = useRef(false);

  useEffect(() => {
    live.current = { projectId, attempt, mounted: true };
    let cancelled = false;
    Promise.all([
      api.getProject(projectId),
      api.getCoverage(projectId),
      api.listFindings(projectId),
      api.listReshoots(projectId),
    ])
      .then(([project, coverage, findings, reshoots]) => {
        if (cancelled) return;
        setState({
          projectId,
          attempt,
          status: "done",
          data: {
            project,
            coverage: coverage.coverage,
            seal: coverage.seal,
            blockers: coverage.blockers,
            findings: findings.findings,
            reshoots: reshoots.reshoots,
          },
          errorMessage: undefined,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const notFound = error instanceof ApiClientError && error.status === 404;
        setState({
          projectId,
          attempt,
          status: notFound ? "not_found" : "error",
          data: undefined,
          errorMessage: notFound ? undefined : messageOf(error),
        });
      });
    return () => {
      cancelled = true;
      live.current.mounted = false;
    };
  }, [api, projectId, attempt]);

  const reload = useCallback(() => {
    setReshootError(undefined);
    setAttempt((n) => n + 1);
  }, []);

  const updateReshoot = useCallback(
    async (reshootId: string, status: ReshootTask["status"]) => {
      if (updating.current) return false;
      updating.current = true;
      const startedOn = live.current;
      const stillHere = () =>
        live.current.mounted &&
        live.current.projectId === startedOn.projectId &&
        live.current.attempt === startedOn.attempt;
      setUpdatingReshootId(reshootId);
      setReshootError(undefined);
      try {
        await api.updateReshoot(reshootId, { status });
        const [reshoots, coverage] = await Promise.all([
          api.listReshoots(startedOn.projectId),
          api.getCoverage(startedOn.projectId),
        ]);
        if (!stillHere()) return false;
        setState((prev) =>
          prev.projectId !== startedOn.projectId || !prev.data
            ? prev
            : {
                ...prev,
                data: {
                  ...prev.data,
                  reshoots: reshoots.reshoots,
                  coverage: coverage.coverage,
                  seal: coverage.seal,
                  blockers: coverage.blockers,
                },
              },
        );
        return true;
      } catch (error: unknown) {
        if (stillHere()) setReshootError({ reshootId, message: messageOf(error) });
        return false;
      } finally {
        updating.current = false;
        if (live.current.mounted) setUpdatingReshootId(undefined);
      }
    },
    [api],
  );

  const requestReshoot = useCallback(
    async (checklistItemId: string, note: string) => {
      if (updating.current) return false;
      updating.current = true;
      const startedOn = live.current;
      const stillHere = () =>
        live.current.mounted &&
        live.current.projectId === startedOn.projectId &&
        live.current.attempt === startedOn.attempt;
      setUpdatingReshootId(`new:${checklistItemId}`);
      setReshootError(undefined);
      try {
        await api.createReshoot(startedOn.projectId, { note, checklistItemId });
        const [reshoots, coverage] = await Promise.all([
          api.listReshoots(startedOn.projectId),
          api.getCoverage(startedOn.projectId),
        ]);
        if (!stillHere()) return false;
        setState((prev) =>
          prev.projectId !== startedOn.projectId || !prev.data
            ? prev
            : {
                ...prev,
                data: {
                  ...prev.data,
                  reshoots: reshoots.reshoots,
                  coverage: coverage.coverage,
                  seal: coverage.seal,
                  blockers: coverage.blockers,
                },
              },
        );
        return true;
      } catch (error: unknown) {
        if (stillHere()) setReshootError({ reshootId: `new:${checklistItemId}`, message: messageOf(error) });
        return false;
      } finally {
        updating.current = false;
        if (live.current.mounted) setUpdatingReshootId(undefined);
      }
    },
    [api],
  );

  const seal = useCallback(
    async (note: string): Promise<SealResult> => {
      if (sealing.current) return { kind: "ignored" };
      sealing.current = true;
      const startedOn = live.current;
      const stillHere = () =>
        live.current.mounted &&
        live.current.projectId === startedOn.projectId &&
        live.current.attempt === startedOn.attempt;
      try {
        const trimmed = note.trim();
        const res = await api.sealProject(startedOn.projectId, trimmed === "" ? {} : { note: trimmed });
        const coverage = await api.getCoverage(startedOn.projectId).catch(() => undefined);
        if (!stillHere()) return { kind: "ignored" };
        setState((prev) =>
          prev.projectId !== startedOn.projectId || !prev.data
            ? prev
            : {
                ...prev,
                data: coverage
                  ? { ...prev.data, coverage: coverage.coverage, seal: coverage.seal, blockers: coverage.blockers }
                  : { ...prev.data, seal: res.seal },
              },
        );
        return { kind: "sealed", seal: res.seal };
      } catch (error: unknown) {
        if (!stillHere()) return { kind: "ignored" };
        const blockers = sealBlockersOf(error);
        if (blockers) {
          // The server's current blockers replace the ones the page loaded earlier.
          setState((prev) => (prev.data ? { ...prev, data: { ...prev.data, blockers } } : prev));
          return { kind: "blocked", blockers, message: messageOf(error) };
        }
        return { kind: "failed", message: messageOf(error) };
      } finally {
        sealing.current = false;
      }
    },
    [api],
  );

  // Until the answer for this project and this attempt lands, show loading.
  const current = state.projectId === projectId && state.attempt === attempt;
  const data = current ? state.data : undefined;
  const canManage = data ? !data.project.project.isDemo && data.project.project.ownerId !== null : false;
  const shared = { reload, canManage, updatingReshootId, reshootError, updateReshoot, requestReshoot, seal };
  return current
    ? { status: state.status, data, errorMessage: state.errorMessage, ...shared }
    : { status: "loading", data: undefined, errorMessage: undefined, ...shared };
}
