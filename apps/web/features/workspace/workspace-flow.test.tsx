import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOCK_STEP_MS } from "../player/use-simulated-player";
import {
  clientFor,
  detail,
  evidence,
  finding,
  hashOf,
  json,
  okRoutes,
} from "./test-fixtures";
import { Workspace } from "./workspace";

// Each segment has its own hash; evidence() gives valid evidence the matching hash.
const segment = (id: string, index: number, text: string) => ({
  id,
  scriptVersionId: "sv1",
  index,
  text,
  hash: hashOf(id),
});

// Three lines. Line 1 and line 3 have evidence; line 2 has none.
const flowDetail = {
  ...detail,
  scriptVersion: {
    ...detail.scriptVersion!,
    segments: [
      segment("s1", 0, "Open the invoice screen."),
      segment("s2", 1, "Nothing shows this line."),
      segment("s3", 2, "All data is encrypted."),
    ],
  },
};

const routes = okRoutes({
  project: () => json(flowDetail),
  evidence: () =>
    json({
      evidence: [
        evidence("e1", "candidate", { scriptSegmentId: "s1", startMs: 1000, endMs: 4000, explanation: "Spoken at 0:01." }),
        evidence("e3", "needs_outside_proof", { scriptSegmentId: "s3", startMs: 8000, endMs: 9000 }),
      ],
    }),
  findings: () =>
    json({
      findings: [
        finding("f2", "phantom_dialogue", "open", {
          scriptSegmentId: "s2",
          found: "The script line exists.",
          notFound: "No spoken sentence covers it.",
          limits: "Speech to text can miss words.",
        }),
      ],
    }),
});

async function load() {
  const { client } = clientFor(routes);
  const view = render(<Workspace projectId="p1" client={client} />);
  await screen.findByRole("heading", { level: 1, name: "Test project" });
  return view;
}

const line = (n: number) => screen.getByRole("button", { name: new RegExp(`^${n}\\.`) });
const marker = (n: number) => screen.getByRole("button", { name: new RegExp(`^Evidence for line ${n},`) });
const clockText = () => screen.getByText(/ s of 20\.0 s$/).textContent;

describe("Workspace flow: one clock for player, timeline, script and Lantern", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeks the clock to the evidence start when a line with evidence is chosen, and opens the Lantern", async () => {
    await load();
    expect(clockText()).toBe("0.0 s of 20.0 s");
    fireEvent.click(line(1));
    expect(clockText()).toBe("1.0 s of 20.0 s");
    expect(screen.getByRole("heading", { name: "Evidence for line 1" })).toBeInTheDocument();
    expect(screen.getByText("Spoken at 0:01.")).toBeInTheDocument();
    expect(screen.getByTestId("playhead")).toHaveStyle({ left: "5%" });
    expect(line(1)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("status").map((n) => n.textContent)).toContain(
      "Line 1 selected. The clock moved to 1 seconds.",
    );
  });

  it("explains a line without evidence and does not move the clock", async () => {
    await load();
    fireEvent.click(line(1));
    fireEvent.click(line(2));
    expect(clockText()).toBe("1.0 s of 20.0 s");
    expect(screen.getByRole("heading", { name: "Line 2: no evidence" })).toBeInTheDocument();
    const lantern = screen.getByRole("heading", { name: "Line 2: no evidence" }).closest("section") as HTMLElement;
    expect(within(lantern).getByText(/the clock did not move/)).toBeInTheDocument();
    // The recorded finding for that line is shown, not an invented one.
    expect(screen.getByText("No spoken sentence covers it.")).toBeInTheDocument();
    const live = screen.getAllByRole("status").map((n) => n.textContent);
    expect(live).toContain("Line 2 has no evidence, so the clock did not move.");
  });

  it("selects the matching line, moves the clock, focuses and scrolls to the line when a marker is chosen", async () => {
    await load();
    fireEvent.click(marker(3));
    expect(clockText()).toBe("8.0 s of 20.0 s");
    expect(line(3)).toHaveFocus();
    expect(line(3)).toHaveAttribute("aria-pressed", "true");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    const lantern = screen.getByRole("heading", { name: "Evidence for line 3" }).closest("section") as HTMLElement;
    expect(within(lantern).getByRole("note")).toHaveTextContent("Footage cannot prove this.");
  });

  it("moves focus back to the selected line when Escape is pressed on the timeline", async () => {
    await load();
    fireEvent.click(line(1));
    marker(1).focus();
    fireEvent.keyDown(marker(1), { key: "Escape" });
    expect(line(1)).toHaveFocus();
  });

  it("highlights the line whose evidence interval holds the time while playing, and none in a gap", async () => {
    await load();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Play simulated clock" }));
    expect(screen.queryByText("Playing now")).not.toBeInTheDocument(); // 0.0 s: before any interval
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(clockText()).toBe("1.5 s of 20.0 s");
    expect(line(1)).toHaveAttribute("aria-current", "true");
    expect(within(line(1)).getByText("Playing now")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000); // 4.5 s: after line 1's interval, in a gap
    });
    expect(screen.queryByText("Playing now")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3800); // 8.3 s
    });
    expect(line(3)).toHaveAttribute("aria-current", "true");
  });

  it("does not highlight a line when the clock is paused, even inside an interval", async () => {
    await load();
    fireEvent.click(line(1));
    expect(clockText()).toBe("1.0 s of 20.0 s");
    expect(screen.queryByText("Playing now")).not.toBeInTheDocument();
  });

  it("plays only the selected part and then stops", async () => {
    await load();
    fireEvent.click(line(1));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Play this part" }));
    expect(screen.getByRole("button", { name: "Pause simulated clock" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(clockText()).toBe("4.0 s of 20.0 s");
    expect(screen.getByRole("button", { name: "Play simulated clock" })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps playing past the end of a part after the user pauses and plays again", async () => {
    await load();
    fireEvent.click(line(1));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Play this part" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause simulated clock" }));
    fireEvent.click(screen.getByRole("button", { name: "Play simulated clock" }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(clockText()).toBe("7.0 s of 20.0 s");
  });

  it("starts one interval for the whole session, ticks once per step, and clears it on unmount", async () => {
    const { unmount } = await load();
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    fireEvent.click(screen.getByRole("button", { name: "Play simulated clock" }));
    fireEvent.click(line(1)); // seek to 1.0 s while playing
    fireEvent.click(marker(3)); // seek to 8.0 s while playing
    fireEvent.click(line(2)); // no evidence: no seek
    act(() => {
      vi.advanceTimersByTime(CLOCK_STEP_MS * 3);
    });
    // Three steps of 0.1 s from 8.0 s: one clock, not several.
    expect(clockText()).toBe("8.3 s of 20.0 s");
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });
  it("announces a saved decision and shows the new status from the server", async () => {
    const { client } = clientFor(
      okRoutes({
        project: () => json({ ...flowDetail, project: { ...flowDetail.project, isDemo: false } }),
        evidence: () => json({ evidence: [evidence("e1", "candidate", { scriptSegmentId: "s1" })] }),
        findings: () => json({ findings: [] }),
        review: () =>
          json({
            evidence: evidence("e1", "confirmed", { scriptSegmentId: "s1" }),
            decision: {
              id: "d1",
              evidenceId: "e1",
              decision: "confirm",
              reviewerId: "u1",
              note: null,
              createdAt: "2026-01-02T00:00:00.000Z",
            },
          }),
      }),
    );
    render(<Workspace projectId="p1" client={client} />);
    await screen.findByRole("heading", { level: 1, name: "Test project" });
    fireEvent.click(line(1));
    fireEvent.click(screen.getByRole("button", { name: "Confirm evidence" }));
    expect(await screen.findByText("Confirmed by a person.")).toBeInTheDocument();
    const live = screen.getAllByRole("status").map((n) => n.textContent);
    expect(live).toContain("Evidence for line 1 confirmed by you.");
  });

  it("announces a refused decision and shows the server text", async () => {
    const { client } = clientFor(
      okRoutes({
        project: () => json({ ...flowDetail, project: { ...flowDetail.project, isDemo: false } }),
        evidence: () => json({ evidence: [evidence("e1", "candidate", { scriptSegmentId: "s1" })] }),
        findings: () => json({ findings: [] }),
        review: () =>
          json({ error: { code: "review_refused", message: "Decision refused: stale_needs_reanalysis." } }, 409),
      }),
    );
    render(<Workspace projectId="p1" client={client} />);
    await screen.findByRole("heading", { level: 1, name: "Test project" });
    fireEvent.click(line(1));
    fireEvent.click(screen.getByRole("button", { name: "Confirm evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Decision refused: stale_needs_reanalysis.");
    expect(screen.getByText("A candidate. A person has not reviewed it yet.")).toBeInTheDocument();
    const live = screen.getAllByRole("status").map((n) => n.textContent);
    expect(live).toContain("The decision for line 1 was not saved.");
  });

  it("moves the playhead and the slider together because they share one clock", async () => {
    await load();
    fireEvent.change(screen.getByRole("slider", { name: "Clock position" }), { target: { value: "10000" } });
    await waitFor(() => expect(clockText()).toBe("10.0 s of 20.0 s"));
    await waitFor(() => expect(screen.getByTestId("playhead")).toHaveStyle({ left: "50%" }));
  });
});

describe("Workspace opened on a line (?line=)", () => {
  it("selects that line, opens its evidence and moves the clock there", async () => {
    const { client } = clientFor(routes);
    render(<Workspace projectId="p1" client={client} initialLine="s3" />);
    await screen.findByRole("heading", { level: 1, name: "Test project" });
    expect(line(3)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Evidence for line 3" })).toBeInTheDocument();
    await waitFor(() => expect(clockText()).toBe("8.0 s of 20.0 s"));
  });

  it("ignores an unknown line", async () => {
    const { client } = clientFor(routes);
    render(<Workspace projectId="p1" client={client} initialLine="nope" />);
    await screen.findByRole("heading", { level: 1, name: "Test project" });
    expect(clockText()).toBe("0.0 s of 20.0 s");
    expect(line(1)).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Workspace: a house of claims", () => {
  it("shows the chapter header and a claims map whose rooms select the line and seek the clock", async () => {
    await load();
    expect(screen.getByText("Chapter II · The investigation")).toBeInTheDocument();
    expect(screen.getByText(/^A house of/)).toHaveTextContent("A house of claims.");
    const map = screen.getByTestId("claims-map");
    fireEvent.click(within(map).getByRole("button", { name: /^Line 3\s*,\s*candidate waiting/i }));
    expect(line(3)).toHaveAttribute("aria-pressed", "true");
    expect(within(map).getByRole("button", { name: /^Line 3\s*,\s*/i })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(clockText()).toBe("8.0 s of 20.0 s"));
    expect(screen.getByRole("heading", { name: "Evidence for line 3" })).toBeInTheDocument();
    expect(within(map).getByRole("button", { name: /^Line 2\s*,\s*no proof yet/i })).toBeInTheDocument();
  });

  it("frames the player as a projector and the Lantern as a side panel", async () => {
    await load();
    expect(screen.getByTestId("projector")).toHaveAccessibleName("Player");
    expect(screen.getByTestId("lantern-panel")).toHaveTextContent("The lantern");
  });
});
