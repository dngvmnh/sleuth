import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { COVERAGE_STATES, FINDING_LABELS, type CoverageSummary, type ReshootTask, type Seal } from "@sleuth/contracts";
import { createApiClient } from "@/lib/api-client";
import { detail, finding, json } from "../workspace/test-fixtures";
import { CoverageTable } from "./coverage-table";
import { ReportBody, ReportView } from "./report-view";
import type { ReportData } from "./use-report";

const checklist = [
  { id: "c1", projectId: "p1", label: "Create an invoice", position: 0 },
  { id: "c2", projectId: "p1", label: "Export a PDF", position: 1 },
  { id: "c3", projectId: "p1", label: "Data is encrypted", position: 2 },
  { id: "c4", projectId: "p1", label: "Send a reminder", position: 3 },
  { id: "c5", projectId: "p1", label: "Show the total", position: 4 },
];

const COVERAGE: CoverageSummary = {
  items: [
    { checklistItemId: "c2", state: "needs_review", evidenceIds: ["e2"] },
    { checklistItemId: "c1", state: "proven", evidenceIds: ["e1"] },
    { checklistItemId: "c3", state: "outside_proof", evidenceIds: [] },
    { checklistItemId: "c4", state: "reshoot", evidenceIds: [] },
    { checklistItemId: "c5", state: "uncovered", evidenceIds: [] },
  ],
  totals: { proven: 1, needs_review: 1, outside_proof: 1, reshoot: 1, uncovered: 1 },
  provenPercent: 20,
  outsideProof: [{ scriptSegmentId: "s2", hint: "A security audit report.", acknowledged: false }],
  openReshootIds: ["r1"],
};

const RESHOOTS: ReshootTask[] = [
  { id: "r1", projectId: "p1", checklistItemId: "c4", scriptSegmentId: null, findingId: null, note: "Film the reminder.", status: "open", createdAt: "2026-01-02T00:00:00.000Z" },
  { id: "r2", projectId: "p1", checklistItemId: null, scriptSegmentId: "s1", findingId: null, note: "Old task, done.", status: "done", createdAt: "2026-01-02T00:00:00.000Z" },
];

function data(over: Partial<ReportData> = {}): ReportData {
  return {
    project: { ...detail, checklist },
    coverage: COVERAGE,
    seal: null,
    blockers: ["undecided_candidates"],
    findings: [
      finding("f1", "ghost", "open", { checklistItemId: "c5", found: "A line points here.", notFound: "No frame shows it.", limits: "Frames are sampled." }),
      finding("f2", "needs_outside_proof", "open", { scriptSegmentId: "s2" }),
    ],
    reshoots: RESHOOTS,
    ...over,
  };
}

const SEAL: Seal = {
  id: "seal-1",
  projectId: "p1",
  sealedBy: "user-1",
  sealedAt: "2026-02-03T04:05:06.000Z",
  scriptVersionId: "sv1",
  assetVersionId: "av1",
  coverage: COVERAGE,
  note: "Checked by hand.",
  status: "active",
  brokenAt: null,
  brokenReason: null,
};

describe("ReportBody", () => {
  it("puts the Draft: not signed off banner first when the project is not sealed", () => {
    const { container } = render(<ReportBody data={data()} />);
    const banner = screen.getByTestId("seal-banner");
    expect(banner).toHaveTextContent("Draft: not signed off");
    expect(banner).toHaveAttribute("data-status", "draft");
    // First thing on the page, before the project name.
    expect(container.firstElementChild?.firstElementChild).toBe(banner);
  });

  it("shows a sealed banner, not the draft one, for an active seal", () => {
    render(<ReportBody data={data({ seal: SEAL })} />);
    const banner = screen.getByTestId("seal-banner");
    expect(banner).toHaveTextContent("Sealed");
    expect(banner).toHaveTextContent("Signed off by user-1 at 2026-02-03 04:05 UTC.");
    expect(banner).toHaveTextContent("Sign-off note: Checked by hand.");
    expect(screen.queryByText("Draft: not signed off")).not.toBeInTheDocument();
  });

  it("says the seal is broken for a broken seal", () => {
    render(<ReportBody data={data({ seal: { ...SEAL, status: "broken", brokenAt: SEAL.sealedAt, brokenReason: "Line 3 changed." } })} />);
    const banner = screen.getByTestId("seal-banner");
    expect(banner).toHaveAttribute("data-status", "broken");
    expect(banner).toHaveTextContent("Seal broken: evidence changed after sign-off");
    expect(banner).toHaveTextContent("Line 3 changed.");
  });

  it("shows an icon in every banner, so the status never relies on colour alone", () => {
    const sealed = render(<ReportBody data={data({ seal: SEAL })} />);
    expect(screen.getByTestId("seal-banner").querySelector("svg")).not.toBeNull();
    sealed.unmount();
    const broken = render(<ReportBody data={data({ seal: { ...SEAL, status: "broken", brokenAt: SEAL.sealedAt, brokenReason: "x" } })} />);
    expect(screen.getByTestId("seal-banner").querySelector("svg")).not.toBeNull();
    broken.unmount();
    render(<ReportBody data={data()} />);
    expect(screen.getByTestId("seal-banner").querySelector("svg")).not.toBeNull();
  });

  it("shows the outlined word that matches the real seal state, and hides it from screen readers", () => {
    const draft = render(<ReportBody data={data()} />);
    expect(screen.getByTestId("seal-word")).toHaveTextContent("UNSEALED");
    expect(screen.getByTestId("seal-word")).toHaveAttribute("aria-hidden", "true");
    draft.unmount();
    const sealed = render(<ReportBody data={data({ seal: SEAL })} />);
    expect(screen.getByTestId("seal-word")).toHaveTextContent("SEALED");
    expect(screen.getByTestId("seal-word")).not.toHaveTextContent("UNSEALED");
    sealed.unmount();
    render(<ReportBody data={data({ seal: { ...SEAL, status: "broken", brokenAt: SEAL.sealedAt, brokenReason: "x" } })} />);
    expect(screen.getByTestId("seal-word")).toHaveTextContent("UNSEALED");
  });

  it("writes the project name inside the one h1, after the real heading words", () => {
    render(<ReportBody data={data()} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("The final seal.");
    expect(h1).toHaveTextContent("Test project");
  });

  it("numbers the ledger rows with two digits and keeps the plain count text", () => {
    render(<ReportBody data={data()} />);
    const rows = screen.getAllByTestId("coverage-row");
    expect(rows[0]).toHaveTextContent(/^01/);
    expect(screen.getByTestId("coverage-proven")).toHaveTextContent(/\d+ of \d+ checklist items? proven/);
  });

  it("lays out the sections in the order of requirement 4.1", () => {
    render(<ReportBody data={data()} />);
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual([
      "The final seal.Test project",
      "Coverage",
      "Findings",
      "Reshoots",
      "Open (1)",
      "Done (1)",
      "Needs outside proof (footage cannot prove this)",
      "Limits of these checks",
      // Task 9 actions come after the 4.1 content.
      "Final Seal",
      "Export",
    ]);
  });

  it("shows each finding with its spooky label beside the plain one and the three parts", () => {
    render(<ReportBody data={data()} />);
    const rows = screen.getAllByTestId("report-finding");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(`${FINDING_LABELS.ghost.spooky}(${FINDING_LABELS.ghost.plain})`);
    expect(rows[0]).toHaveTextContent("About: Show the total");
    expect(rows[0]).toHaveTextContent("What was found: A line points here.");
    expect(rows[0]).toHaveTextContent("What was not found: No frame shows it.");
    expect(rows[0]).toHaveTextContent("Limits of this check: Frames are sampled.");
    expect(rows[1]).toHaveTextContent("Needs Outside Proof(Footage cannot prove this)");
  });

  it("lists open reshoots first, then done ones, with what each is about", () => {
    render(<ReportBody data={data()} />);
    const open = screen.getByRole("list", { name: "Open reshoots" });
    const done = screen.getByRole("list", { name: "Done reshoots" });
    expect(open).toHaveTextContent("Film the reminder.");
    expect(open).toHaveTextContent("Checklist item: Send a reminder");
    expect(done).toHaveTextContent("Old task, done.");
    expect(done).toHaveTextContent("Line 1: Hello there.");
  });

  it("lists outside-proof lines with the kind of proof and who marked them", () => {
    render(<ReportBody data={data()} />);
    const item = screen.getByTestId("outside-proof");
    expect(item).toHaveTextContent("Line 2: Click Export.");
    expect(item).toHaveTextContent("Proof that could back it: A security audit report.");
    expect(item).toHaveTextContent("Proposed by the software only. Nobody has marked it yet.");
  });

  it("states the limits of the checks", () => {
    render(<ReportBody data={data()} />);
    const limits = screen.getByRole("heading", { name: "Limits of these checks" }).closest("section") as HTMLElement;
    expect(limits).toHaveTextContent("Only a person can confirm them.");
    expect(limits).toHaveTextContent("Confidence is a ranking, not proof.");
  });

  it("shows empty states for no findings, no open reshoots and no outside-proof lines", () => {
    render(
      <ReportBody
        data={data({
          findings: [],
          reshoots: [RESHOOTS[1]!],
          coverage: { ...COVERAGE, outsideProof: [], openReshootIds: [] },
        })}
      />,
    );
    expect(screen.getByText(/No findings\./)).toBeInTheDocument();
    expect(screen.getByText("No open reshoot tasks.")).toBeInTheDocument();
    expect(screen.getByText("No script line needs proof from outside the video.")).toBeInTheDocument();
  });
});

describe("CoverageTable reshoot action", () => {
  it("offers Ask for a reshoot only on uncovered rows, and only with actions (owner)", () => {
    const actions = { updatingId: undefined, error: undefined, onRequestReshoot: async () => true };
    const { unmount } = render(<CoverageTable coverage={COVERAGE} checklist={checklist} actions={actions} />);
    expect(screen.getAllByRole("button", { name: /^Ask for a reshoot/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Ask for a reshoot: Show the total",
    ]);
    unmount();
    render(<CoverageTable coverage={COVERAGE} checklist={checklist} />);
    expect(screen.queryByRole("button", { name: /^Ask for a reshoot/ })).not.toBeInTheDocument();
  });
});

describe("CoverageTable", () => {
  it("shows the API's totals and percentage, not its own count", () => {
    // The totals here deliberately differ from the rows: the table must show what the API says.
    render(
      <CoverageTable
        coverage={{ ...COVERAGE, totals: { proven: 3, needs_review: 0, outside_proof: 0, reshoot: 0, uncovered: 2 }, provenPercent: 60 }}
        checklist={checklist}
      />,
    );
    expect(screen.getByTestId("coverage-proven")).toHaveTextContent("3 of 5 checklist items proven (60%).");
    const totals = screen.getByRole("list", { name: "Coverage totals" });
    expect(totals).toHaveTextContent("Proven: 3");
    expect(totals).toHaveTextContent("Uncovered: 2");
  });

  it("lists rows in checklist order with the item label and the evidence count", () => {
    render(<CoverageTable coverage={COVERAGE} checklist={checklist} />);
    const rows = screen.getAllByTestId("coverage-row");
    expect(rows.map((r) => within(r).getAllByRole("cell")[1]?.textContent)).toEqual([
      "Create an invoice",
      "Export a PDF",
      "Data is encrypted",
      "Send a reminder",
      "Show the total",
    ]);
    expect(rows[0]).toHaveTextContent("1 candidate");
    expect(rows[2]).toHaveTextContent("0 candidates");
  });

  it("names every state in words and gives each a different icon, so colour is not needed", () => {
    render(<CoverageTable coverage={COVERAGE} checklist={checklist} />);
    const rows = screen.getAllByTestId("coverage-row");
    const byState = new Map(
      rows.map((r) => {
        const cell = r.querySelector("[data-state]") as HTMLElement;
        return [cell.dataset.state, { text: cell.textContent, icon: cell.querySelector("svg")?.innerHTML }];
      }),
    );
    expect([...byState.keys()].sort()).toEqual([...COVERAGE_STATES].sort());
    expect(byState.get("proven")?.text).toBe("Proven (a person confirmed the evidence)");
    expect(byState.get("needs_review")?.text).toBe("Needs review (candidates nobody has decided on)");
    expect(byState.get("outside_proof")?.text).toBe("Needs outside proof (a person marked it, footage cannot prove it)");
    expect(byState.get("reshoot")?.text).toBe("Needs a reshoot (a person asked for new footage)");
    expect(byState.get("uncovered")?.text).toBe("Uncovered (no usable evidence)");
    expect(new Set([...byState.values()].map((v) => v.icon)).size).toBe(5);
  });

  it("explains an empty checklist", () => {
    render(
      <CoverageTable
        coverage={{ ...COVERAGE, items: [], totals: { proven: 0, needs_review: 0, outside_proof: 0, reshoot: 0, uncovered: 0 }, provenPercent: 0 }}
        checklist={[]}
      />,
    );
    expect(screen.getByText(/This project has no checklist items/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("ReportView states", () => {
  type Route = () => Response | Promise<Response>;
  function view(routes: { project?: Route; coverage?: Route }) {
    const fetchImpl = async (url: unknown): Promise<Response> => {
      const u = String(url);
      if (u.endsWith("/coverage")) return (routes.coverage ?? (() => json({ coverage: COVERAGE, seal: null, blockers: [] })))();
      if (u.endsWith("/findings")) return json({ findings: [] });
      if (u.endsWith("/reshoots")) return json({ reshoots: [] });
      return (routes.project ?? (() => json({ ...detail, checklist })))();
    };
    render(<ReportView projectId="p1" client={createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch })} />);
  }

  it("shows a loading state first", () => {
    view({ project: () => new Promise<Response>(() => undefined) });
    expect(screen.getByRole("status", { name: "Loading report" })).toBeInTheDocument();
  });

  it("shows project not found", async () => {
    view({ project: () => json({ error: { code: "not_found", message: "No such project." } }, 404) });
    expect(await screen.findByRole("heading", { name: "Project not found" })).toBeInTheDocument();
  });

  it("shows an error and loads after Try again", async () => {
    let fail = true;
    view({
      coverage: () =>
        fail
          ? json({ error: { code: "boom", message: "Coverage is down." } }, 500)
          : json({ coverage: COVERAGE, seal: null, blockers: [] }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Coverage is down.");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("seal-banner")).toHaveTextContent("Draft: not signed off");
    expect(screen.getAllByTestId("coverage-row")).toHaveLength(5);
  });
});
