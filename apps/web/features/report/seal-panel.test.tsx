import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CoverageSummary, Seal, SealBlocker } from "@sleuth/contracts";
import { ExportButtons } from "./export-buttons";
import { RequestReshoot } from "./request-reshoot";
import { BLOCKER_TEXT, SealPanel, type SealPanelProps } from "./seal-panel";
import type { SealResult } from "./use-report";

const COVERAGE: CoverageSummary = {
  items: [],
  totals: { proven: 0, needs_review: 0, outside_proof: 0, reshoot: 0, uncovered: 0 },
  provenPercent: 0,
  outsideProof: [],
  openReshootIds: [],
};

const SEAL: Seal = {
  id: "seal-1",
  projectId: "p1",
  sealedBy: "fixture-user",
  sealedAt: "2026-02-03T04:05:06.000Z",
  scriptVersionId: "sv1",
  assetVersionId: "av1",
  coverage: COVERAGE,
  note: "Checked by hand.",
  status: "active",
  brokenAt: null,
  brokenReason: null,
};

function show(over: Partial<SealPanelProps> = {}) {
  const onSeal = vi.fn<(note: string) => Promise<SealResult>>(async () => ({ kind: "sealed", seal: SEAL }));
  const utils = render(<SealPanel projectId="p1" seal={null} blockers={[]} canManage onSeal={onSeal} {...over} />);
  return { onSeal, user: userEvent.setup(), ...utils };
}

const ALL: SealBlocker[] = ["undecided_candidates", "stale_evidence", "uncovered_items", "job_running", "no_analysis"];

describe("SealPanel", () => {
  it("shows no seal button on the demo or to a non-owner, and says why", () => {
    show({ canManage: false });
    expect(screen.queryByRole("button", { name: "Apply the Final Seal" })).not.toBeInTheDocument();
    expect(screen.getByText(/only the owner of an editable copy can apply the Final Seal/)).toBeInTheDocument();
  });

  it("disables the button and explains every blocker in plain words", () => {
    show({ blockers: ALL });
    const button = screen.getByRole("button", { name: "Apply the Final Seal" });
    expect(button).toBeDisabled();
    const list = screen.getByRole("list", { name: "What blocks the Final Seal" });
    for (const b of ALL) expect(list).toHaveTextContent(BLOCKER_TEXT[b]);
    expect(list.querySelectorAll("li")).toHaveLength(5);
    // Each fixable blocker points at the workspace.
    expect(screen.getAllByRole("link", { name: "Open the workspace" })).toHaveLength(4);
  });

  it("describes the disabled button with the blocker sentences, not the list's label", () => {
    // Narrator read only "The Final Seal is not available yet What blocks the Final Seal" (2026-11-11):
    // a described-by wrapper around a labelled list gives the list's label, not its items.
    show({ blockers: ["stale_evidence", "job_running"] });
    const button = screen.getByRole("button", { name: "Apply the Final Seal" });
    expect(button).toHaveAccessibleDescription(
      `The Final Seal is not available yet: ${BLOCKER_TEXT.stale_evidence} ${BLOCKER_TEXT.job_running}`,
    );
    expect(button).not.toHaveAccessibleDescription(/What blocks the Final Seal/);
    expect(button).not.toHaveAccessibleDescription(/Open the workspace/);
  });

  it("asks for confirmation before sending, with an optional note", async () => {
    const { onSeal, user } = show();
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    expect(onSeal).not.toHaveBeenCalled();
    expect(screen.getByText(/You are signing that you reviewed these items/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Note (optional)"), "Checked by hand.");
    await user.click(screen.getByRole("button", { name: "Sign and seal" }));
    expect(onSeal).toHaveBeenCalledTimes(1);
    expect(onSeal).toHaveBeenCalledWith("Checked by hand.");
  });

  it("lets the person cancel without sending", async () => {
    const { onSeal, user } = show();
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSeal).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply the Final Seal" })).toBeEnabled();
  });

  it("locks the confirm step while the request runs and sends once", async () => {
    let release: (r: SealResult) => void = () => undefined;
    const onSeal = vi.fn(
      () =>
        new Promise<SealResult>((resolve) => {
          release = resolve;
        }),
    );
    const { user } = show({ onSeal });
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    await user.click(screen.getByRole("button", { name: "Sign and seal" }));
    const busy = screen.getByRole("button", { name: "Sealing..." });
    expect(busy).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(busy);
    expect(onSeal).toHaveBeenCalledTimes(1);
    release({ kind: "sealed", seal: SEAL });
    expect(await screen.findByTestId("seal-confirmation")).toBeInTheDocument();
  });

  it("shows the wax seal and announces it only after the server confirms", async () => {
    const { user } = show();
    expect(screen.queryByTestId("seal-confirmation")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    await user.click(screen.getByRole("button", { name: "Sign and seal" }));
    const confirmation = await screen.findByTestId("seal-confirmation");
    expect(confirmation).toHaveTextContent("Final Seal applied");
    expect(confirmation).toHaveTextContent("Signed off by fixture-user at 2026-02-03 04:05 UTC. Note: Checked by hand.");
    expect(confirmation.querySelector("svg")).toHaveClass("sleuth-seal-stamp");
    expect(screen.getByRole("status")).toHaveTextContent("The Final Seal was applied. The report is now signed off.");
  });

  it("shows no wax seal and the server's text when sealing is refused with new blockers", async () => {
    const onSeal = vi.fn(async (): Promise<SealResult> => ({
      kind: "blocked",
      blockers: ["job_running"],
      message: "The project cannot be sealed yet.",
    }));
    const { user, rerender } = show({ onSeal });
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    await user.click(screen.getByRole("button", { name: "Sign and seal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The project cannot be sealed yet. See what still blocks it below.");
    expect(screen.queryByTestId("seal-confirmation")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The Final Seal was refused.");
    // The hook puts the server's blockers into the report data; the panel then lists them.
    rerender(<SealPanel projectId="p1" seal={null} blockers={["job_running"]} canManage onSeal={onSeal} />);
    expect(screen.getByRole("list", { name: "What blocks the Final Seal" })).toHaveTextContent(BLOCKER_TEXT.job_running);
    expect(screen.getByRole("button", { name: "Apply the Final Seal" })).toBeDisabled();
  });

  it("shows other server errors and keeps the confirm step open to try again", async () => {
    const onSeal = vi.fn(async (): Promise<SealResult> => ({ kind: "failed", message: "Sign in to apply the Final Seal." }));
    const { user } = show({ onSeal });
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    await user.click(screen.getByRole("button", { name: "Sign and seal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in to apply the Final Seal.");
    expect(screen.getByRole("button", { name: "Sign and seal" })).toBeEnabled();
    expect(screen.queryByTestId("seal-confirmation")).not.toBeInTheDocument();
  });

  it("does not offer a second seal while one is active", () => {
    show({ seal: SEAL });
    expect(screen.queryByRole("button", { name: "Apply the Final Seal" })).not.toBeInTheDocument();
    expect(screen.getByText(/This project is sealed/)).toBeInTheDocument();
  });

  it("offers sealing again after a broken seal, subject to the blockers", () => {
    show({ seal: { ...SEAL, status: "broken" }, blockers: ["stale_evidence"] });
    expect(screen.getByRole("button", { name: "Apply the Final Seal" })).toBeDisabled();
    expect(screen.getByText(BLOCKER_TEXT.stale_evidence)).toBeInTheDocument();
  });
});

describe("SealPanel focus (Final Seal task 10)", () => {
  it("moves focus to the note when the confirm step opens, and back to the button on Cancel", async () => {
    const { user } = show();
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    expect(screen.getByLabelText("Note (optional)")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Apply the Final Seal" })).toHaveFocus();
  });

  it("moves focus to the wax-seal confirmation after a seal", async () => {
    const { user } = show();
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    await user.click(screen.getByRole("button", { name: "Sign and seal" }));
    expect(await screen.findByRole("group", { name: "Final Seal applied" })).toHaveFocus();
  });

  it("moves focus back to the button after a refusal", async () => {
    const onSeal = vi.fn(async (): Promise<SealResult> => ({ kind: "blocked", blockers: ["job_running"], message: "No." }));
    const { user } = show({ onSeal });
    await user.click(screen.getByRole("button", { name: "Apply the Final Seal" }));
    await user.click(screen.getByRole("button", { name: "Sign and seal" }));
    expect(await screen.findByRole("button", { name: "Apply the Final Seal" })).toHaveFocus();
  });
});

describe("RequestReshoot", () => {
  it("asks for a note, sends it trimmed and closes on success", async () => {
    const onRequest = vi.fn(async () => true);
    render(<RequestReshoot itemLabel="Export a PDF" busy={false} locked={false} error={undefined} onRequest={onRequest} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ask for a reshoot: Export a PDF" }));
    const note = screen.getByLabelText("What to film again for “Export a PDF”");
    expect(note).toHaveFocus();
    expect(screen.getByRole("button", { name: "Create reshoot task" })).toBeDisabled();
    await user.type(note, "  Film the export.  ");
    await user.click(screen.getByRole("button", { name: "Create reshoot task" }));
    expect(onRequest).toHaveBeenCalledWith("Film the export.");
    expect(screen.getByRole("button", { name: "Ask for a reshoot: Export a PDF" })).toBeInTheDocument();
  });

  it("shows the server's message and stays open on failure", async () => {
    const onRequest = vi.fn(async () => false);
    const { rerender } = render(
      <RequestReshoot itemLabel="Export a PDF" busy={false} locked={false} error={undefined} onRequest={onRequest} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ask for a reshoot: Export a PDF" }));
    await user.type(screen.getByLabelText("What to film again for “Export a PDF”"), "Film it.");
    await user.click(screen.getByRole("button", { name: "Create reshoot task" }));
    rerender(<RequestReshoot itemLabel="Export a PDF" busy={false} locked={false} error="Not allowed." onRequest={onRequest} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not create the reshoot task: Not allowed.");
    expect(screen.getByLabelText("What to film again for “Export a PDF”")).toHaveValue("Film it.");
  });
});

describe("ExportButtons", () => {
  it("links to the existing CSV and HTML exports and prints the page", async () => {
    const print = vi.fn();
    render(<ExportButtons projectId="proj 1" print={print} />);
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href", "/api/v1/projects/proj%201/report.csv");
    expect(screen.getByRole("link", { name: "Open printable HTML" })).toHaveAttribute(
      "href",
      "/api/v1/projects/proj%201/report.html",
    );
    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});
