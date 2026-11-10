import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorsPanel } from "./editors-panel";
import { detail } from "./test-fixtures";
import type { ProjectState } from "./use-project";

function stateWith(over: Partial<ProjectState> = {}): ProjectState {
  return {
    status: "done",
    detail,
    evidence: [],
    findings: [],
    errorMessage: undefined,
    reviewingId: undefined,
    reviewError: undefined,
    reviewErrorId: undefined,
    refresh: vi.fn(),
    review: vi.fn(async () => true),
    reshoot: vi.fn(async () => true),
    saveScript: vi.fn(),
    saveChecklist: vi.fn(async () => []),
    makeCopy: vi.fn(async () => "copy-1"),
    requestUploadUrl: vi.fn(),
    sync: vi.fn(async () => undefined),
    startAnalysis: vi.fn(),
    fetchJob: vi.fn(),
    ...over,
  };
}

describe("EditorsPanel", () => {
  it("shows the demo read-only with a note and makes an editable copy, then opens it", async () => {
    const navigate = vi.fn();
    const state = stateWith();
    render(<EditorsPanel state={state} navigate={navigate} />);
    expect(screen.getByRole("note")).toHaveTextContent("The demo is read-only.");
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    expect(state.makeCopy).toHaveBeenCalledWith("Copy of Test project");
    expect(navigate).toHaveBeenCalledWith("/projects/copy-1");
  });

  it("shows the server's error when the copy fails", async () => {
    const state = stateWith({
      makeCopy: vi.fn(async () => {
        throw new Error("Sign in to create a project.");
      }),
    });
    render(<EditorsPanel state={state} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in to create a project.");
    expect(screen.getByRole("button", { name: "Make an editable copy" })).toBeEnabled();
  });

  it("is editable with no copy button on a project the user owns", () => {
    render(
      <EditorsPanel
        state={stateWith({ detail: { ...detail, project: { ...detail.project, isDemo: false } } })}
        navigate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Make an editable copy" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox")[0]).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save checklist" })).toBeInTheDocument();
  });
});
