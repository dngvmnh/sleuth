import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingJob } from "@sleuth/contracts";
import { AnalysisPanel } from "./analysis-panel";
import { evidence, finding } from "./test-fixtures";

// Job states below are simulated for tests only. The fixture API keeps a job queued
// because the web app runs no worker.
function job(id: string, status: ProcessingJob["status"], over: Partial<ProcessingJob> = {}): ProcessingJob {
  return {
    id,
    projectId: "p1",
    kind: "analysis",
    status,
    attempts: 0,
    maxAttempts: 3,
    lockedBy: null,
    heartbeatAt: null,
    error: null,
    payload: { assetVersionId: "av1", scriptVersionId: "sv1" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Let resolved promises run without moving the clock. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function show(props: Partial<React.ComponentProps<typeof AnalysisPanel>> = {}) {
  const onSucceeded = vi.fn();
  const utils = render(
    <AnalysisPanel
      readOnly={false}
      evidence={[evidence("e1", "candidate"), evidence("e2", "confirmed"), evidence("e3", "needs_outside_proof")]}
      findings={[finding("f1", "ghost"), finding("f2", "cursed_frame", "resolved")]}
      startAnalysis={vi.fn(async () => job("j1", "queued"))}
      fetchJob={vi.fn()}
      onSucceeded={onSucceeded}
      {...props}
    />,
  );
  return { ...utils, onSucceeded };
}

describe("AnalysisPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("follows queued, then running, then succeeded, polling every 2 seconds", async () => {
    const answers = [job("j1", "running", { attempts: 1 }), job("j1", "succeeded", { attempts: 1 })];
    const fetchJob = vi.fn(async () => answers.shift() ?? job("j1", "succeeded"));
    const { onSucceeded } = show({ fetchJob });

    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await flush();
    expect(screen.getByTestId("job-processing")).toHaveTextContent(
      "Analysis queued. Waiting for a worker to pick it up. Attempt 0 of 3.",
    );
    expect(fetchJob).not.toHaveBeenCalled();

    await advance(1999);
    expect(fetchJob).not.toHaveBeenCalled();
    await advance(1);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    expect(fetchJob).toHaveBeenCalledWith("j1");
    expect(screen.getByTestId("job-processing")).toHaveTextContent("Analysis running. Attempt 1 of 3.");

    await advance(2000);
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("job-done")).toHaveTextContent(
      "Still needs a person: 2 evidence candidates to confirm or reject, and 1 open finding.",
    );
    expect(onSucceeded).toHaveBeenCalledTimes(1);

    // Stopped: no more checks once the job is done.
    await advance(10_000);
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows a failed job's error, and Try again starts a new job that is then followed", async () => {
    const startAnalysis = vi
      .fn()
      .mockResolvedValueOnce(job("j1", "queued"))
      .mockResolvedValueOnce(job("j2", "queued"));
    const fetchJob = vi.fn(async (id: string) =>
      id === "j1"
        ? job("j1", "failed", { attempts: 3, error: "Transcription provider timed out." })
        : job("j2", "succeeded", { attempts: 1 }),
    );
    const { onSucceeded } = show({ startAnalysis, fetchJob });

    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await flush();
    await advance(2000);
    const failed = screen.getByTestId("job-failed");
    expect(failed).toHaveAttribute("role", "alert");
    expect(failed).toHaveTextContent("The analysis failed after 3 of 3 attempts.");
    expect(failed).toHaveTextContent("Transcription provider timed out.");
    await advance(10_000);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    expect(onSucceeded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(startAnalysis).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("job-processing")).toHaveTextContent("Analysis queued.");
    await advance(2000);
    expect(fetchJob).toHaveBeenLastCalledWith("j2");
    expect(screen.getByTestId("job-done")).toBeInTheDocument();
    expect(onSucceeded).toHaveBeenCalledTimes(1);
  });

  it("never sends a second check while one is still waiting for an answer", async () => {
    let answer: (j: ProcessingJob) => void = () => undefined;
    const fetchJob = vi.fn(
      () =>
        new Promise<ProcessingJob>((resolve) => {
          answer = resolve;
        }),
    );
    show({ fetchJob });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await flush();
    await advance(2000);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer(job("j1", "running", { attempts: 1 }));
      await Promise.resolve();
    });
    await advance(2000);
    expect(fetchJob).toHaveBeenCalledTimes(2);
  });

  it("drops a late answer for a job it no longer follows", async () => {
    const startAnalysis = vi
      .fn()
      .mockResolvedValueOnce(job("j1", "failed", { attempts: 3, error: "boom" }))
      .mockResolvedValueOnce(job("j2", "queued"));
    const fetchJob = vi.fn(async () => job("j2", "running", { attempts: 1 }));
    show({ startAnalysis, fetchJob });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await flush();
    expect(screen.getByTestId("job-failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    await advance(2000);
    expect(screen.getByTestId("job-processing")).toHaveTextContent("Analysis running. Attempt 1 of 3.");
    expect(screen.queryByTestId("job-failed")).not.toBeInTheDocument();
  });

  it("stops polling and ignores answers after it is removed", async () => {
    let answer: (j: ProcessingJob) => void = () => undefined;
    const fetchJob = vi.fn(
      () =>
        new Promise<ProcessingJob>((resolve) => {
          answer = resolve;
        }),
    );
    const { unmount, onSucceeded } = show({ fetchJob });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await flush();
    await advance(2000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      answer(job("j1", "succeeded"));
      await Promise.resolve();
    });
    await advance(10_000);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    expect(onSucceeded).not.toHaveBeenCalled();
  });

  it("keeps polling after a failed check and says so", async () => {
    const fetchJob = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network down."))
      .mockResolvedValueOnce(job("j1", "running", { attempts: 1 }));
    show({ fetchJob });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await flush();
    await advance(2000);
    expect(screen.getByText("Could not check the job: Network down. Trying again in 2 seconds.")).toBeInTheDocument();
    await advance(2000);
    expect(screen.getByTestId("job-processing")).toHaveTextContent("Analysis running.");
    expect(screen.queryByText(/Could not check the job/)).not.toBeInTheDocument();
  });

  it("shows the server's message when the analysis cannot start", async () => {
    const startAnalysis = vi.fn(async () => {
      throw new Error("Add a video and a script before analysis.");
    });
    show({ startAnalysis });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Add a video and a script before analysis.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is read-only on the demo", () => {
    show({ readOnly: true });
    expect(screen.queryByRole("button", { name: "Run analysis" })).not.toBeInTheDocument();
    expect(screen.getByText(/The demo is read-only/)).toBeInTheDocument();
  });
});
