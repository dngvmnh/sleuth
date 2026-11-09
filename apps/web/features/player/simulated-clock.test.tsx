import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulatedClock } from "./simulated-clock";
import { CLOCK_STEP_MS, useSimulatedPlayer } from "./use-simulated-player";

/** The clock as the workspace uses it: one hook, one component. */
function ClockHarness({ durationMs }: { durationMs: number }) {
  const clock = useSimulatedPlayer(durationMs);
  return <SimulatedClock clock={clock} />;
}

describe("SimulatedClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts paused at 0 with no timer running", () => {
    render(<ClockHarness durationMs={10_000} />);
    expect(screen.getByText("0.0 s of 10.0 s")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("advances while playing and stops on pause", () => {
    render(<ClockHarness durationMs={10_000} />);
    fireEvent.click(screen.getByRole("button", { name: "Play simulated clock" }));
    act(() => {
      vi.advanceTimersByTime(CLOCK_STEP_MS * 5);
    });
    expect(screen.getByText("0.5 s of 10.0 s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause simulated clock" }));
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("0.5 s of 10.0 s")).toBeInTheDocument();
  });

  it("moves to a position chosen with the slider", () => {
    render(<ClockHarness durationMs={10_000} />);
    fireEvent.change(screen.getByRole("slider", { name: "Clock position" }), { target: { value: "4000" } });
    expect(screen.getByText("4.0 s of 10.0 s")).toBeInTheDocument();
  });

  it("stops by itself at the end and shows the play button again", () => {
    render(<ClockHarness durationMs={300} />);
    fireEvent.click(screen.getByRole("button", { name: "Play simulated clock" }));
    act(() => {
      vi.advanceTimersByTime(CLOCK_STEP_MS * 10);
    });
    expect(screen.getByText("0.3 s of 0.3 s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play simulated clock" })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a single timer when the component re-renders while playing", () => {
    const { rerender } = render(<ClockHarness durationMs={10_000} />);
    fireEvent.click(screen.getByRole("button", { name: "Play simulated clock" }));
    expect(vi.getTimerCount()).toBe(1);
    rerender(<ClockHarness durationMs={10_000} />);
    rerender(<ClockHarness durationMs={10_000} />);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("clears its timer on unmount and does not tick afterwards", () => {
    const { unmount } = render(<ClockHarness durationMs={10_000} />);
    fireEvent.click(screen.getByRole("button", { name: "Play simulated clock" }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it("cannot be played when there is no duration", () => {
    render(<ClockHarness durationMs={0} />);
    expect(screen.getByRole("button", { name: "Play simulated clock" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Clock position" })).toBeDisabled();
  });
});
