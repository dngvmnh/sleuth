import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChecklistItem, EvidenceCandidate, ScriptSegment } from "@sleuth/contracts";
import { buildRooms, ClaimsMap, roomLabel, roomStateOf, sizeOf, type Room } from "./claims-map";

const seg = (id: string, index: number, text: string) => ({ id, index, text }) as ScriptSegment;
const item = (id: string, position: number, label: string) => ({ id, position, label }) as ChecklistItem;
const ev = (id: string, scriptSegmentId: string, checklistItemId: string | null, status = "candidate") =>
  ({ id, scriptSegmentId, checklistItemId, status }) as EvidenceCandidate;

describe("room states", () => {
  it("maps every line state onto one of the four rooms", () => {
    expect(roomStateOf("covered")).toBe("covered");
    expect(roomStateOf("needs_review")).toBe("waiting");
    expect(roomStateOf("outside_proof")).toBe("waiting");
    expect(roomStateOf("stale")).toBe("stale");
    expect(roomStateOf("uncovered")).toBe("none");
    expect(roomStateOf(undefined)).toBe("none");
  });

  it("sizes rooms by text length", () => {
    expect(sizeOf("Short line.")).toBe("S");
    expect(sizeOf("x".repeat(60))).toBe("M");
    expect(sizeOf("x".repeat(120))).toBe("L");
  });
});

describe("buildRooms", () => {
  const segments = [seg("s2", 1, "Second."), seg("s1", 0, "First.")];
  const states = { s1: "covered", s2: "stale" } as const;
  const checklist = [item("c2", 2, "Show export"), item("c1", 1, "Show login")];

  it("makes one room per line and per item, in order, and gives an item the best state of its lines", () => {
    const rooms = buildRooms(segments, states, checklist, [
      ev("e1", "s1", "c1"),
      ev("e2", "s2", "c1"),
      ev("e3", "s2", "c2"),
      ev("e4", "s1", "c2", "rejected"),
    ]);
    expect(rooms.map((r) => [r.kind, r.number, r.state, r.segmentId])).toEqual([
      ["line", 1, "covered", "s1"],
      ["line", 2, "stale", "s2"],
      ["item", 1, "covered", "s1"],
      ["item", 2, "stale", "s2"],
    ]);
  });

  it("leaves an item with no evidence as no proof yet, with no line to open", () => {
    const [, , first] = buildRooms(segments, states, checklist, []);
    expect(first).toMatchObject({ kind: "item", state: "none", segmentId: null });
  });

  it("labels rooms in full", () => {
    const rooms = buildRooms(segments, states, checklist, []);
    expect(roomLabel(rooms[0] as Room)).toBe('Line 1, Covered: "First."');
    expect(roomLabel(rooms[2] as Room)).toBe('Checklist Item 1, No proof yet: "Show login"');
  });
});

describe("ClaimsMap", () => {
  const rooms = buildRooms(
    [seg("s1", 0, "First."), seg("s2", 1, "Second."), seg("s3", 2, "Third."), seg("s4", 3, "Fourth.")],
    { s1: "covered", s2: "needs_review", s3: "uncovered", s4: "stale" },
    [item("c1", 1, "Show login")],
    [],
  );

  function renderMap(over: Partial<Parameters<typeof ClaimsMap>[0]> = {}) {
    const onSelectLine = vi.fn();
    const onAnnounce = vi.fn();
    render(
      <ClaimsMap
        rooms={rooms}
        selectedSegmentId="s2"
        onSelectLine={onSelectLine}
        onAnnounce={onAnnounce}
        linesCovered={1}
        linesTotal={4}
        {...over}
      />,
    );
    return { onSelectLine, onAnnounce };
  }

  it("gives each state its own border style and icon, and a legend for all four", () => {
    renderMap();
    const style = (name: RegExp) => screen.getByRole("button", { name }).className;
    expect(style(/^Line 1, covered/i)).toContain("border-solid");
    expect(style(/^Line 2, candidate waiting/i)).toContain("border-dashed");
    expect(style(/^Line 3, no proof yet/i)).toContain("border-dotted");
    expect(style(/^Line 4, stale after edit/i)).toContain("border-double");
    const icons = ["Line 1", "Line 2", "Line 3", "Line 4"].map(
      (l) => screen.getByRole("button", { name: new RegExp(`^${l},`, "i") }).querySelector("svg")?.innerHTML,
    );
    expect(new Set(icons).size).toBe(4);
    const legend = screen.getByRole("list", { name: "Room states" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent?.split(" ").slice(0, 2).join(" "))).toEqual([
      "Covered A",
      "Candidate waiting",
      "No proof",
      "Stale after",
    ]);
  });

  it("shows the big count of covered claims and keeps the coverage bar", () => {
    renderMap();
    expect(screen.getByTestId("claims-count")).toHaveTextContent("01of 5 claims covered");
    expect(screen.getByRole("progressbar", { name: "Script lines covered" })).toHaveAttribute("aria-valuenow", "1");
  });

  it("marks the selected line, and a click opens a line or explains why it cannot", async () => {
    const { onSelectLine, onAnnounce } = renderMap();
    expect(screen.getByRole("button", { name: /^Line 2,/i })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /^Line 3,/i }));
    expect(onSelectLine).toHaveBeenCalledWith("s3");
    await userEvent.click(screen.getByRole("button", { name: /^Checklist item 1,/i }));
    expect(onAnnounce).toHaveBeenCalledWith("Checklist item 1 has no evidence yet, so there is no line to open.");
  });
});
