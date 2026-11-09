import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TimelineMarker } from "./markers";
import { Timeline } from "./timeline";

const markers: TimelineMarker[] = [
  { id: "m1", segmentId: "s1", line: 1, startMs: 1000, endMs: 5000, confidence: "medium", state: "needs_review" },
  { id: "m2", segmentId: "s2", line: 2, startMs: 10_000, endMs: 12_000, confidence: "high", state: "covered" },
  { id: "m3", segmentId: "s3", line: 3, startMs: 20_000, endMs: 22_000, confidence: "low", state: "stale" },
  { id: "m4", segmentId: "s4", line: 4, startMs: 30_000, endMs: 35_000, confidence: "low", state: "outside_proof" },
];

function setup(overrides: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  const onSelect = vi.fn();
  const onEscape = vi.fn();
  const user = userEvent.setup();
  render(
    <Timeline
      markers={markers}
      durationMs={40_000}
      currentMs={0}
      selectedId={null}
      onSelect={onSelect}
      onEscape={onEscape}
      {...overrides}
    />,
  );
  const buttons = () => screen.getAllByRole("button");
  return { user, onSelect, onEscape, buttons };
}

describe("Timeline", () => {
  it("is a labelled toolbar with one button per marker, each named by line, time, confidence and state", () => {
    const { buttons } = setup();
    expect(screen.getByRole("toolbar", { name: "Evidence markers" })).toBeInTheDocument();
    expect(buttons().map((b) => b.getAttribute("aria-label"))).toEqual([
      "Evidence for line 1, 1 to 5 seconds, medium confidence, Cursed Frame, needs human check",
      "Evidence for line 2, 10 to 12 seconds, high confidence, confirmed by a person",
      "Evidence for line 3, 20 to 22 seconds, low confidence, Poltergeist, evidence out of date",
      "Evidence for line 4, 30 to 35 seconds, low confidence, Needs Outside Proof, footage cannot prove this",
    ]);
  });

  it("shows a different shape for each state, not only a different colour", () => {
    const { buttons } = setup();
    const shapes = buttons().map((b) => b.querySelector("svg")?.innerHTML);
    expect(new Set(shapes).size).toBe(4);
  });

  it("lists every shape with its spooky and plain-English name", () => {
    setup();
    const legend = screen.getByRole("list", { name: "Marker shapes" });
    expect(legend).toHaveTextContent("Covered (A person confirmed the evidence)");
    expect(legend).toHaveTextContent("Cursed Frame (Needs human check)");
    expect(legend).toHaveTextContent("Poltergeist (Evidence out of date)");
    expect(legend).toHaveTextContent("Needs Outside Proof (Footage cannot prove this)");
  });

  it("puts only the first marker in the tab order", () => {
    const { buttons } = setup();
    expect(buttons().map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it("enters the toolbar with one Tab and leaves with the next", async () => {
    const { user, buttons } = setup();
    await user.tab();
    expect(buttons()[0]!).toHaveFocus();
    await user.tab();
    expect(buttons().some((b) => b === document.activeElement)).toBe(false);
  });

  it("moves to the next marker with Right and moves the tab stop with it", async () => {
    const { user, buttons } = setup();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(buttons()[1]!).toHaveFocus();
    expect(buttons().map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it("moves to the previous marker with Left", async () => {
    const { user, buttons } = setup();
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowLeft}");
    expect(buttons()[1]!).toHaveFocus();
  });

  it("stops at the first and last marker instead of wrapping", async () => {
    const { user, buttons } = setup();
    await user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(buttons()[0]!).toHaveFocus();
    await user.keyboard("{End}{ArrowRight}");
    expect(buttons()[3]!).toHaveFocus();
  });

  it("jumps to the last marker with End and the first with Home", async () => {
    const { user, buttons } = setup();
    await user.tab();
    await user.keyboard("{End}");
    expect(buttons()[3]!).toHaveFocus();
    await user.keyboard("{Home}");
    expect(buttons()[0]!).toHaveFocus();
  });

  it("selects the focused marker with Enter", async () => {
    const { user, onSelect } = setup();
    await user.tab();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(markers[1]);
  });

  it("selects with Space and with a click as well", async () => {
    const { user, onSelect, buttons } = setup();
    await user.tab();
    await user.keyboard(" ");
    await user.click(buttons()[2]!);
    expect(onSelect.mock.calls.map(([m]) => (m as TimelineMarker).id)).toEqual(["m1", "m3"]);
  });

  it("calls onEscape when Escape is pressed on a marker", async () => {
    const { user, onEscape } = setup();
    await user.tab();
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("marks the selected marker as pressed", () => {
    const { buttons } = setup({ selectedId: "m2" });
    expect(buttons().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false"]);
  });

  it("announces position on arrow keys and the choice on selection, politely", async () => {
    const { user } = setup();
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(live).toHaveTextContent("Marker 2 of 4");
    await user.keyboard("{Enter}");
    expect(live).toHaveTextContent(/^Selected: Evidence for line 2, 10 to 12 seconds/);
  });

  it("places the playhead and markers by the shared geometry", () => {
    const { buttons } = setup({ currentMs: 10_000 });
    expect(screen.getByTestId("playhead")).toHaveStyle({ left: "25%" });
    expect(buttons()[1]!).toHaveStyle({ left: "25%" });
    expect(buttons()[3]!).toHaveStyle({ left: "75%" });
  });

  it("says there are no markers when there is no evidence", async () => {
    const { user, onEscape } = setup({ markers: [] });
    expect(screen.getByText("No evidence markers for this project.")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    await user.click(screen.getByRole("toolbar"));
    expect(onEscape).not.toHaveBeenCalled();
  });
});
