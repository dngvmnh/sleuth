"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import type { GetProjectResponseSchema } from "@sleuth/contracts";
import type {
  ChecklistItem,
  CreateScriptResponse,
  EvidenceCandidate,
  Finding,
  ProcessingJob,
  ReviewRequest,
} from "@sleuth/contracts";
import { useApiClient } from "@/components/guest-auth-provider";
import { useSaveStatus } from "@/components/shell/save-status";
import { ApiClientError, type ApiClient } from "@/lib/api-client";

/** Project detail as the API returns it (the contracts package exports the schema, not this type). */
export type ProjectDetail = z.infer<typeof GetProjectResponseSchema>;

export type WorkspaceStatus = "loading" | "error" | "not_found" | "empty" | "done";

interface Loaded {
  projectId: string;
  status: WorkspaceStatus;
  detail: ProjectDetail | undefined;
  evidence: EvidenceCandidate[];
  findings: Finding[];
  errorMessage: string | undefined;
}

export interface ProjectState {
  status: WorkspaceStatus;
  detail: ProjectDetail | undefined;
  evidence: EvidenceCandidate[];
  findings: Finding[];
  errorMessage: string | undefined;
  /** Id of the evidence whose review request is running, if any. */
  reviewingId: string | undefined;
  reviewError: string | undefined;
  /** The evidence the error belongs to. */
  reviewErrorId: string | undefined;
  refresh: () => void;
  /**
   * Record a human review decision. The server decides whether it is allowed.
   * Replaces the returned evidence in state, then reloads findings (the server resolves linked ones).
   */
  review: (evidenceId: string, request: ReviewRequest) => Promise<boolean>;
  /**
   * Needs reshoot with a note: records the decision, then creates the reshoot task.
   * If the server refuses the decision, no task is created.
   */
  reshoot: (evidence: EvidenceCandidate, note: string) => Promise<boolean>;
  /** Save a new script version. Resolves with the server's diff; rejects with its error. */
  saveScript: (text: string) => Promise<CreateScriptResponse>;
  /** Replace the whole checklist. */
  saveChecklist: (labels: string[]) => Promise<ChecklistItem[]>;
  /** Make an editable copy of this (demo) project. Resolves with the new project id. */
  makeCopy: (name: string) => Promise<string>;
  /** Ask for an upload URL; this creates the new video version on the server. */
  requestUploadUrl: ApiClient["createUploadUrl"] extends (id: string, p: infer P) => infer R ? (p: P) => R : never;
  /** Reload project, evidence and findings without the loading state. */
  sync: () => Promise<void>;
  /** Queue a full analysis of the current video and script. */
  startAnalysis: () => Promise<ProcessingJob>;
  /** Read one job of this project. */
  fetchJob: (jobId: string) => Promise<ProcessingJob>;
  /** Ask for a short-lived playback URL of one asset version (`url: null` when nothing plays). */
  fetchPlaybackUrl: (assetVersionId: string) => Promise<{ url: string | null; expiresAt: string | null }>;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

function initial(projectId: string): Loaded {
  return {
    projectId,
    status: "loading",
    detail: undefined,
    evidence: [],
    findings: [],
    errorMessage: undefined,
  };
}

/**
 * Loads a project, its evidence and its findings through the typed client.
 * A response for an earlier project, an earlier request or an unmounted component is dropped.
 */
export function useProject(projectId: string, client?: ApiClient): ProjectState {
  const shared = useApiClient();
  const api = useMemo(() => client ?? shared, [client, shared]);
  // Writes report into the footer's save indicator (a no-op without the shell).
  const { track } = useSaveStatus();
  const [state, setState] = useState<Loaded>(() => initial(projectId));
  const [attempt, setAttempt] = useState(0);
  const [reviewingId, setReviewingId] = useState<string | undefined>(undefined);
  const [reviewError, setReviewError] = useState<string | undefined>(undefined);
  const [reviewErrorId, setReviewErrorId] = useState<string | undefined>(undefined);
  // The project and request the screen is on right now. Async work checks this before writing.
  const live = useRef({ projectId, attempt: 0, mounted: false });
  const reviewInFlight = useRef(false);

  useEffect(() => {
    live.current = { projectId, attempt, mounted: true };
    let cancelled = false;
    Promise.all([api.getProject(projectId), api.listEvidence(projectId), api.listFindings(projectId)])
      .then(([detail, evidence, findings]) => {
        if (cancelled) return;
        const hasContent = detail.scriptVersion !== null || evidence.evidence.length > 0;
        setState({
          projectId,
          status: hasContent ? "done" : "empty",
          detail,
          evidence: evidence.evidence,
          findings: findings.findings,
          errorMessage: undefined,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const notFound = error instanceof ApiClientError && error.status === 404;
        setState({
          ...initial(projectId),
          status: notFound ? "not_found" : "error",
          errorMessage: notFound ? undefined : messageOf(error),
        });
      });
    return () => {
      cancelled = true;
      live.current.mounted = false;
    };
  }, [api, projectId, attempt]);

  const refresh = useCallback(() => {
    setState(initial(projectId));
    setReviewError(undefined);
    setReviewErrorId(undefined);
    setAttempt((n) => n + 1);
  }, [projectId]);

  /** Reload everything without showing the loading state. Drops the answer if the screen moved on. */
  const reloadQuietly = useCallback(async () => {
    const startedOn = live.current;
    const [detail, evidence, findings] = await Promise.all([
      api.getProject(startedOn.projectId),
      api.listEvidence(startedOn.projectId),
      api.listFindings(startedOn.projectId),
    ]);
    if (
      !live.current.mounted ||
      live.current.projectId !== startedOn.projectId ||
      live.current.attempt !== startedOn.attempt
    ) {
      return;
    }
    setState((prev) =>
      prev.projectId !== startedOn.projectId
        ? prev
        : {
            ...prev,
            status: detail.scriptVersion !== null || evidence.evidence.length > 0 ? "done" : "empty",
            detail,
            evidence: evidence.evidence,
            findings: findings.findings,
          },
    );
  }, [api]);

  const saveScript = useCallback(
    async (text: string): Promise<CreateScriptResponse> => {
      const res = await track(api.createScript(live.current.projectId, { text }));
      // The server marked evidence stale and added findings; show them.
      await reloadQuietly();
      return res;
    },
    [api, reloadQuietly, track],
  );

  const saveChecklist = useCallback(
    async (labels: string[]): Promise<ChecklistItem[]> => {
      const res = await track(
        api.setChecklist(live.current.projectId, {
          items: labels.map((label) => ({ label })),
        }),
      );
      await reloadQuietly();
      return res.items;
    },
    [api, reloadQuietly, track],
  );

  const requestUploadUrl = useCallback(
    (params: Parameters<ApiClient["createUploadUrl"]>[1]) => api.createUploadUrl(live.current.projectId, params),
    [api],
  );

  const startAnalysis = useCallback(
    async () => (await api.startAnalysis(live.current.projectId, {})).job,
    [api],
  );

  const fetchJob = useCallback(
    async (jobId: string) => (await api.getJob(live.current.projectId, jobId)).job,
    [api],
  );

  const fetchPlaybackUrl = useCallback(
    async (assetVersionId: string) => api.getPlaybackUrl(live.current.projectId, assetVersionId),
    [api],
  );

  const makeCopy = useCallback(
    async (name: string): Promise<string> => {
      const res = await api.createProject(name, true);
      return res.project.id;
    },
    [api],
  );

  /**
   * Runs one review request at a time. Pending state, the in-flight guard and the error text
   * live here; `work` does the calls and the state updates. Resolves true on success.
   */
  const run = useCallback(
    async (
      evidenceId: string,
      work: (ctx: { projectId: string; stillHere: () => boolean }) => Promise<void>,
    ): Promise<boolean> => {
      if (reviewInFlight.current) return false;
      reviewInFlight.current = true;
      const startedOn = live.current;
      const stillHere = () =>
        live.current.mounted &&
        live.current.projectId === startedOn.projectId &&
        live.current.attempt === startedOn.attempt;
      setReviewingId(evidenceId);
      setReviewError(undefined);
      setReviewErrorId(undefined);
      try {
        await work({ projectId: startedOn.projectId, stillHere });
        return stillHere();
      } catch (error: unknown) {
        if (stillHere()) {
          setReviewError(messageOf(error));
          setReviewErrorId(evidenceId);
        }
        return false;
      } finally {
        reviewInFlight.current = false;
        if (live.current.mounted) setReviewingId(undefined);
      }
    },
    [],
  );

  const applyReview = useCallback(
    async (
      ctx: { projectId: string; stillHere: () => boolean },
      evidenceId: string,
      request: ReviewRequest,
    ) => {
      const res = await track(api.reviewEvidence(evidenceId, request));
      if (!ctx.stillHere()) return;
      setState((prev) =>
        prev.projectId !== ctx.projectId
          ? prev
          : { ...prev, evidence: prev.evidence.map((e) => (e.id === res.evidence.id ? res.evidence : e)) },
      );
      const fresh = await api.listFindings(ctx.projectId);
      if (!ctx.stillHere()) return;
      setState((prev) =>
        prev.projectId !== ctx.projectId ? prev : { ...prev, findings: fresh.findings },
      );
    },
    [api, track],
  );

  const review = useCallback(
    (evidenceId: string, request: ReviewRequest) =>
      run(evidenceId, (ctx) => applyReview(ctx, evidenceId, request)),
    [run, applyReview],
  );

  const reshoot = useCallback(
    (target: EvidenceCandidate, note: string) =>
      run(target.id, async (ctx) => {
        // The server decides first. A refused decision creates no reshoot task.
        await applyReview(ctx, target.id, { decision: "needs_reshoot", note });
        if (!ctx.stillHere()) return;
        try {
          await api.createReshoot(ctx.projectId, {
            note,
            scriptSegmentId: target.scriptSegmentId,
            ...(target.checklistItemId ? { checklistItemId: target.checklistItemId } : {}),
          });
        } catch (error: unknown) {
          throw new Error(
            `The decision was saved, but the reshoot task could not be created: ${messageOf(error)}`,
            { cause: error },
          );
        }
      }),
    [run, applyReview, api],
  );
  // If the id changed and the new load has not landed, show loading, never the old project.
  const current = state.projectId === projectId ? state : initial(projectId);

  return {
    status: current.status,
    detail: current.detail,
    evidence: current.evidence,
    findings: current.findings,
    errorMessage: current.errorMessage,
    reviewingId,
    reviewError,
    reviewErrorId,
    refresh,
    review,
    reshoot,
    saveScript,
    saveChecklist,
    makeCopy,
    requestUploadUrl,
    sync: reloadQuietly,
    startAnalysis,
    fetchJob,
    fetchPlaybackUrl,
  };
}
