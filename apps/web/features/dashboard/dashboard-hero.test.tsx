import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FINDING_LABELS, type EvidenceCandidate, type Finding, type ScriptSegment } from "@sleuth/contracts";
import type { ApiClient } from "@/lib/api-client";
import { clueHref, DashboardHero } from "./dashboard-hero";
import { FINDING_GUIDE, FINDING_ORDER, TAG_TEXT } from "./finding-guide";
import { FindingsCabinet } from "./findings-cabinet";
import { batCycleSeconds } from "./hero-art";
import { formatClock, pickClue } from "./use-demo-snapshot";

const seg = (id: string, index: number, text: string) => ({ id, index, text }) as ScriptSegment;
const finding = (over: Partial<Finding>): Finding =>
  ({
    id: "f",
    projectId: "proofpay-demo",
    type: "ghost",
    plainLabel: "x",
    checklistItemId: null,
    scriptSegmentId: null,
    evidenceId: null,
    found: "found",
    notFound: "not found",
    limits: "limits",
    status: "open",
    analysisRunId: "run",
    ...over,
  }) as Finding;

describe("pickClue", () => {
  const segments = [seg("seg-1", 0, "Welcome."), seg("seg-3", 2, "Enter the client name.")];
  const evidence = [{ id: "ev-3", startMs: 11_000 } as EvidenceCandidate];

  it("takes the first open finding tied to a line, with its line, time and text", () => {
    const clue = pickClue(
      [
        finding({ id: "g", type: "ghost", checklistItemId: "c1" }),
        finding({ id: "r", type: "cursed_frame", scriptSegmentId: "seg-1", status: "resolved" }),
        finding({ id: "c", type: "cursed_frame", scriptSegmentId: "seg-3", evidenceId: "ev-3" }),
      ],
      evidence,
      segments,
    );
    expect(clue).toEqual({
      findingId: "c",
      type: "cursed_frame",
      line: 3,
      segmentId: "seg-3",
      startMs: 11_000,
      excerpt: "Enter the client name.",
    });
  });

  it("falls back to any open finding, and gives nothing when none is open", () => {
    expect(pickClue([finding({ id: "g", checklistItemId: "c1" })], [], segments)).toMatchObject({
      findingId: "g",
      line: null,
      startMs: null,
      excerpt: "not found",
    });
    expect(pickClue([finding({ status: "resolved" })], [], segments)).toBeNull();
  });

  it("links into the workspace on the clue's line", () => {
    const clue = pickClue([finding({ scriptSegmentId: "seg-3" })], [], segments);
    expect(clueHref("proofpay-demo", clue!)).toBe("/projects/proofpay-demo?line=seg-3");
    expect(formatClock(11_000)).toBe("0:11");
    expect(formatClock(75_400)).toBe("1:15");
  });
});

function client(over: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    listProjects: vi.fn(async () => ({ projects: [{ id: "proofpay-demo", isDemo: true, name: "ProofPay demo" }] })),
    getCoverage: vi.fn(async () => ({
      coverage: {
        items: [{}, {}, {}, {}, {}],
        totals: { proven: 1, needs_review: 2, outside_proof: 1, reshoot: 0, uncovered: 1 },
      },
    })),
    listFindings: vi.fn(async () => ({
      findings: [finding({ id: "c", type: "cursed_frame", scriptSegmentId: "seg-3", evidenceId: "ev-3" })],
    })),
    listEvidence: vi.fn(async () => ({ evidence: [{ id: "ev-3", startMs: 11_000 }] })),
    getProject: vi.fn(async () => ({ scriptVersion: { segments: [seg("seg-3", 2, "Enter the client name.")] } })),
    ...over,
  } as unknown as ApiClient;
}

describe("DashboardHero", () => {
  it("shows the heading, the real demo coverage and a clue that opens its line", async () => {
    render(<DashboardHero client={client()} />);
    expect(screen.getByRole("heading", { level: 1, name: /^The cut is haunted/ })).toBeInTheDocument();
    expect(await screen.findByTestId("hero-coverage")).toHaveTextContent("01 / 05 · checklist items proven in the demo");
    const clue = await screen.findByTestId("clue-card");
    expect(clue).toHaveAttribute("href", "/projects/proofpay-demo?line=seg-3");
    expect(clue).toHaveTextContent("Cursed Frame · Needs human check");
    expect(clue).toHaveTextContent("Line 3 · 0:11");
    expect(screen.getByRole("link", { name: /Open the public demo/ })).toHaveAttribute("href", "/projects/proofpay-demo");
    const steps = screen.getByRole("region", { name: /^A little further into the cut/ });
    expect(within(steps).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/projects/proofpay-demo",
      "/projects/proofpay-demo",
      "/projects/proofpay-demo/report",
    ]);
  });

  it("hides the numbers and the clue when the demo cannot be loaded", async () => {
    const failing = client({ listFindings: vi.fn(async () => Promise.reject(new Error("500"))) });
    render(<DashboardHero client={failing} />);
    await waitFor(() => expect(failing.listFindings).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("hero-coverage")).toBeNull();
    expect(screen.queryByTestId("clue-card")).toBeNull();
    expect(screen.queryByRole("link", { name: /Open the public demo/ })).toBeNull();
    // The way to start is still there.
    expect(screen.getByRole("link", { name: "Start a project" })).toHaveAttribute("href", "/#projects");
  });

  it("keeps all art and the giant word away from screen readers", () => {
    const { container } = render(<DashboardHero client={client()} />);
    expect(screen.getByTestId("hero-art")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".outline-word")).toHaveAttribute("aria-hidden", "true");
    expect(container.textContent).not.toMatch(/\b(level|xp|quest|unlock|achievement)\b/i);
  });

  it("lets the bat cross every 20 to 40 seconds", () => {
    expect(batCycleSeconds(() => 0)).toBe(20);
    expect(batCycleSeconds(() => 0.999)).toBe(40);
  });
});

describe("FindingsCabinet", () => {
  it("has one radio per finding type, the first chosen and explained", () => {
    render(<FindingsCabinet />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(FINDING_ORDER.length);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    const detail = screen.getByTestId("cabinet-detail");
    expect(detail).toHaveTextContent(FINDING_LABELS.ghost.meaning);
    expect(detail).toHaveTextContent(FINDING_GUIDE.ghost.found);
    expect(detail).toHaveTextContent(FINDING_GUIDE.ghost.clear);
    // Only the chosen card is a tab stop.
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("moves and chooses with the arrow keys, Home and End", async () => {
    render(<FindingsCabinet />);
    const user = userEvent.setup();
    const radios = screen.getAllByRole("radio");
    radios[0]?.focus();
    await user.keyboard("{ArrowRight}");
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("cabinet-detail")).toHaveTextContent(FINDING_LABELS.phantom_dialogue.meaning);
    await user.keyboard("{End}");
    expect(radios[4]).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowDown}");
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowUp}");
    expect(radios[4]).toHaveFocus();
  });

  it("chooses on click and shows each card's plain name and real tag", async () => {
    render(<FindingsCabinet />);
    await userEvent.click(screen.getByRole("radio", { name: /^Poltergeist/ }));
    expect(screen.getByTestId("cabinet-detail")).toHaveTextContent(FINDING_GUIDE.poltergeist.found);
    for (const type of FINDING_ORDER) {
      const card = screen.getByRole("radio", { name: new RegExp(`^${FINDING_LABELS[type].spooky}`) });
      expect(card).toHaveTextContent(`(${FINDING_LABELS[type].plain})`);
      expect(card).toHaveTextContent(TAG_TEXT[FINDING_GUIDE[type].tag]);
    }
    // Real seal rules: candidates, stale evidence and uncovered checklist items block it.
    expect(FINDING_GUIDE.cursed_frame.tag).toBe("blocks");
    expect(FINDING_GUIDE.poltergeist.tag).toBe("blocks");
    expect(FINDING_GUIDE.ghost.tag).toBe("blocks");
    expect(FINDING_GUIDE.needs_outside_proof.tag).toBe("outside");
  });
});
