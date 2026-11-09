import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { evidence } from "../workspace/test-fixtures";
import { DEMO_REASON, ExorcismActions, STALE_REASON } from "./actions";

function show(props: Partial<React.ComponentProps<typeof ExorcismActions>> = {}) {
  const onDecide = vi.fn();
  const onReshoot = vi.fn();
  render(
    <ExorcismActions
      evidence={evidence("e1")}
      isDemo={false}
      pending={false}
      error={undefined}
      onDecide={onDecide}
      onReshoot={onReshoot}
      {...props}
    />,
  );
  return { onDecide, onReshoot, user: userEvent.setup() };
}

describe("ExorcismActions", () => {
  it("offers the four decisions with plain names", () => {
    show();
    for (const name of ["Confirm evidence", "Reject", "Needs reshoot", "Needs outside proof"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
  });

  it("sends the matching decision for each action", async () => {
    const { onDecide, user } = show();
    await user.click(screen.getByRole("button", { name: "Confirm evidence" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(screen.getByRole("button", { name: "Needs outside proof" }));
    expect(onDecide.mock.calls.map(([d]) => d)).toEqual(["confirm", "reject", "needs_outside_proof"]);
  });

  it("asks for a note before Needs reshoot and sends the trimmed note", async () => {
    const { onDecide, onReshoot, user } = show();
    await user.click(screen.getByRole("button", { name: "Needs reshoot" }));
    expect(onDecide).not.toHaveBeenCalled();
    const create = screen.getByRole("button", { name: "Create reshoot task" });
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText("Reshoot note"), "   ");
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText("Reshoot note"), " Film the export button. ");
    await user.click(create);
    expect(onReshoot).toHaveBeenCalledWith("Film the export button.");
    expect(screen.queryByLabelText("Reshoot note")).not.toBeInTheDocument();
  });

  it("lets the user cancel the note without sending anything", async () => {
    const { onDecide, onReshoot, user } = show();
    await user.click(screen.getByRole("button", { name: "Needs reshoot" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Reshoot note")).not.toBeInTheDocument();
    expect(onDecide).not.toHaveBeenCalled();
    expect(onReshoot).not.toHaveBeenCalled();
  });

  it("disables every action on the demo and says why", () => {
    show({ isDemo: true });
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByText(DEMO_REASON)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm evidence" })).toHaveAccessibleDescription(DEMO_REASON);
  });

  it("offers only Dismiss for stale evidence and says why the rest are off", () => {
    show({ evidence: evidence("e1", "stale") });
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    for (const name of ["Confirm evidence", "Needs reshoot", "Needs outside proof"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByText(STALE_REASON)).toBeInTheDocument();
  });

  it("sends Dismiss as a reject decision", async () => {
    const { onDecide, user } = show({ evidence: evidence("e1", "stale") });
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDecide).toHaveBeenCalledWith("reject");
  });

  it("locks every action and says it is saving while a request is running", async () => {
    const { onDecide, user } = show({ pending: true });
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saving your decision...");
    await user.click(screen.getByRole("button", { name: "Confirm evidence" }));
    expect(onDecide).not.toHaveBeenCalled();
  });

  it("shows the server's message unchanged as an alert", () => {
    show({ error: "Decision refused: stale_needs_reanalysis." });
    expect(screen.getByRole("alert")).toHaveTextContent("Decision refused: stale_needs_reanalysis.");
  });

  it("has no bulk or all-items control", () => {
    show();
    expect(screen.queryByRole("button", { name: /all|every|bulk/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});
