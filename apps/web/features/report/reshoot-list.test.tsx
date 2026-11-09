import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReshootTask } from "@sleuth/contracts";
import { detail } from "../workspace/test-fixtures";
import { OutsideProofList } from "./outside-proof-list";
import { DONE_DOES_NOT_PROVE, ReshootList, type ReshootListProps } from "./reshoot-list";

const checklist = [{ id: "c1", projectId: "p1", label: "Export a PDF", position: 0 }];
const segments = detail.scriptVersion?.segments ?? [];

const open: ReshootTask = {
  id: "r1",
  projectId: "p1",
  checklistItemId: "c1",
  scriptSegmentId: "s1",
  findingId: null,
  note: "Film the export button.",
  status: "open",
  createdAt: "2026-01-02T00:00:00.000Z",
};
const done: ReshootTask = { ...open, id: "r2", checklistItemId: null, note: "Old take.", status: "done" };

function show(over: Partial<ReshootListProps> = {}) {
  const onMarkDone = vi.fn();
  render(
    <ReshootList
      reshoots={[done, open]}
      checklist={checklist}
      segments={segments}
      canManage
      updatingId={undefined}
      error={undefined}
      onMarkDone={onMarkDone}
      {...over}
    />,
  );
  return { onMarkDone, user: userEvent.setup() };
}

describe("ReshootList", () => {
  it("shows open and done reshoots with the checklist item and script line from the API", () => {
    show();
    const openList = screen.getByRole("list", { name: "Open reshoots" });
    expect(within(openList).getByTestId("reshoot-status")).toHaveTextContent("Open");
    expect(openList).toHaveTextContent("Checklist item: Export a PDF");
    expect(openList).toHaveTextContent("Line 1: Hello there.");
    const doneList = screen.getByRole("list", { name: "Done reshoots" });
    expect(within(doneList).getByTestId("reshoot-status")).toHaveTextContent("Done");
    expect(doneList).toHaveTextContent("Old take.");
  });

  it("says that done only closes the reshoot task and does not prove the item", () => {
    show();
    expect(screen.getByText(DONE_DOES_NOT_PROVE)).toBeInTheDocument();
    expect(DONE_DOES_NOT_PROVE).toMatch(/only closes the reshoot task/);
    expect(DONE_DOES_NOT_PROVE).toMatch(/Proven only when new evidence is found and a person confirms it/);
  });

  it("shows Mark done to the owner on open reshoots only", async () => {
    const { onMarkDone, user } = show();
    const buttons = screen.getAllByRole("button", { name: /^Mark done/ });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    expect(onMarkDone).toHaveBeenCalledWith("r1");
  });

  it("shows no Mark done on the demo or to anyone who cannot manage the project, and says why", () => {
    show({ canManage: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only: only the owner of an editable copy/)).toBeInTheDocument();
  });

  it("locks Mark done while an update runs", async () => {
    const { onMarkDone, user } = show({ updatingId: "r1" });
    const button = screen.getByRole("button", { name: /^Mark done/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Saving...");
    await user.click(button);
    expect(onMarkDone).not.toHaveBeenCalled();
  });

  it("shows the server's message on the reshoot that failed", () => {
    show({ error: { reshootId: "r1", message: "The demo project is read-only." } });
    const row = screen.getByRole("list", { name: "Open reshoots" });
    expect(within(row).getByRole("alert")).toHaveTextContent("Could not update the reshoot: The demo project is read-only.");
  });

  it("shows empty states for no open and no done reshoots", () => {
    show({ reshoots: [] });
    expect(screen.getByText("No open reshoot tasks.")).toBeInTheDocument();
    expect(screen.getByText("No reshoot tasks are done yet.")).toBeInTheDocument();
  });
});

describe("OutsideProofList", () => {
  it("shows the line, the proof hint, and that the software only proposed it", () => {
    render(
      <OutsideProofList
        items={[{ scriptSegmentId: "s2", hint: "A security audit report.", acknowledged: false }]}
        segments={segments}
      />,
    );
    const item = screen.getByTestId("outside-proof");
    expect(item).toHaveAttribute("data-acknowledged", "false");
    expect(item).toHaveTextContent("Line 2: Click Export.");
    expect(item).toHaveTextContent("Proof that could back it: A security audit report.");
    expect(screen.getByTestId("outside-proof-status")).toHaveTextContent(
      "Proposed by the software only. Nobody has marked it yet.",
    );
  });

  it("says when a person marked it", () => {
    render(
      <OutsideProofList
        items={[{ scriptSegmentId: "s1", hint: "A compliance certificate.", acknowledged: true }]}
        segments={segments}
      />,
    );
    expect(screen.getByTestId("outside-proof")).toHaveAttribute("data-acknowledged", "true");
    expect(screen.getByTestId("outside-proof-status")).toHaveTextContent(
      "Marked by a person: this needs proof from outside the video.",
    );
  });

  it("shows an empty state", () => {
    render(<OutsideProofList items={[]} segments={segments} />);
    expect(screen.getByText("No script line needs proof from outside the video.")).toBeInTheDocument();
  });
});
