import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";
import { detail, evidence, finding } from "../workspace/test-fixtures";
import { Lantern } from "./lantern";

const segment = detail.scriptVersion!.segments[1]!; // index 0 -> line 1 ("Hello there.")

function show(props: Partial<React.ComponentProps<typeof Lantern>> = {}) {
  const onPlayPart = vi.fn();
  render(
    <Lantern
      segment={segment}
      evidence={evidence("e1", "candidate", { startMs: 11_000, endMs: 18_000, confidence: "high" })}
      findings={[]}
      onPlayPart={onPlayPart}
      {...props}
    />,
  );
  return { onPlayPart };
}

describe("Lantern", () => {
  it("asks the user to pick something when nothing is selected", () => {
    show({ segment: undefined, evidence: undefined });
    expect(screen.getByRole("heading", { name: "Evidence Lantern" })).toBeInTheDocument();
    expect(screen.getByText(/Select a marker on the timeline or a line of the script/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play this part" })).not.toBeInTheDocument();
  });

  it("shows the explanation, the three parts, the confidence as a ranking and the time range", () => {
    show({
      evidence: evidence("e1", "candidate", { startMs: 11_000, endMs: 18_000, confidence: "high", explanation: "Spoken at 0:11." }),
      findings: [
        finding("f1", "cursed_frame", "open", {
          evidenceId: "e1",
          scriptSegmentId: segment.id,
          found: "A frame shares words.",
          notFound: "Not every word was seen.",
          limits: "Matching compares words only.",
        }),
      ],
    });
    expect(screen.getByRole("heading", { name: "Evidence for line 1" })).toBeInTheDocument();
    expect(screen.getByText("Spoken at 0:11.")).toBeInTheDocument();
    expect(screen.getByText("A frame shares words.")).toBeInTheDocument();
    expect(screen.getByText("Not every word was seen.")).toBeInTheDocument();
    expect(screen.getByText("Matching compares words only.")).toBeInTheDocument();
    expect(screen.getByText("What was found")).toBeInTheDocument();
    expect(screen.getByText("What was not found")).toBeInTheDocument();
    expect(screen.getByText("Limits of this check")).toBeInTheDocument();
    expect(screen.getByText(/A ranking, not proof\./)).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("Time range: 11 s to 18 s")).toBeInTheDocument();
  });

  it("still gives all three parts when no finding exists, and says the limits are general", () => {
    show();
    expect(screen.getByText("What was found")).toBeInTheDocument();
    expect(screen.getByText("What was not found")).toBeInTheDocument();
    expect(screen.getByText(/It can be wrong or miss a step/)).toBeInTheDocument();
  });

  it("never calls a candidate confirmed", () => {
    const { container } = render(
      <Lantern segment={segment} evidence={evidence("e1", "candidate")} findings={[]} onPlayPart={() => undefined} />,
    );
    expect(container.textContent ?? "").not.toMatch(/confirmed/i);
    expect(screen.getByText(/A candidate\. A person has not reviewed it yet\./)).toBeInTheDocument();
  });

  it("says confirmed only for evidence a person confirmed", () => {
    show({ evidence: evidence("e1", "confirmed") });
    expect(screen.getByText("Confirmed by a person.")).toBeInTheDocument();
  });

  it("pairs every finding label with its plain-English label", () => {
    const types: FindingType[] = ["ghost", "phantom_dialogue", "cursed_frame", "poltergeist", "needs_outside_proof"];
    show({
      findings: types.map((type, i) =>
        finding(`f${i}`, type, "open", { scriptSegmentId: segment.id, evidenceId: null }),
      ),
    });
    for (const type of types) {
      const label = FINDING_LABELS[type];
      const spooky = screen.getAllByText(label.spooky);
      expect(spooky.length).toBeGreaterThan(0);
      expect(screen.getAllByText(`(${label.plain})`).length).toBeGreaterThan(0);
    }
  });

  it("shows the Poltergeist label for out-of-date evidence", () => {
    show({ evidence: evidence("e1", "stale") });
    expect(screen.getByText("Poltergeist")).toBeInTheDocument();
    expect(screen.getByText("(Evidence out of date)")).toBeInTheDocument();
  });

  it("says footage cannot prove an outside-proof claim and shows the kind of proof needed", () => {
    show({
      evidence: evidence("e1", "needs_outside_proof"),
      findings: [
        finding("f1", "needs_outside_proof", "open", {
          scriptSegmentId: segment.id,
          evidenceId: null,
          limits: "Needs a certificate from outside the video.",
        }),
      ],
    });
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Footage cannot prove this.");
    expect(note).toHaveTextContent("Needs a certificate from outside the video.");
  });

  it("uses a general proof hint when no finding says what kind of proof is needed", () => {
    show({ evidence: evidence("e1", "needs_outside_proof") });
    expect(screen.getByRole("note")).toHaveTextContent(/outside the video, such as a document/);
  });

  it("plays the selected part with its start and end", async () => {
    const { onPlayPart } = show({
      evidence: evidence("e1", "candidate", { startMs: 11_000, endMs: 18_000 }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Play this part" }));
    expect(onPlayPart).toHaveBeenCalledWith(11_000, 18_000);
  });

  it("explains a line with no evidence, with the Ghost label and without a play button", () => {
    show({ evidence: undefined });
    expect(screen.getByRole("heading", { name: "Line 1: no evidence" })).toBeInTheDocument();
    expect(screen.getByText("Ghost")).toBeInTheDocument();
    expect(screen.getByText("(No visual evidence)")).toBeInTheDocument();
    expect(screen.getByText(/the clock did not move/)).toBeInTheDocument();
    expect(screen.getByText("Limits of this check")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play this part" })).not.toBeInTheDocument();
  });

  it("shows the findings recorded for a line that has no evidence", () => {
    show({
      evidence: undefined,
      findings: [
        finding("f1", "phantom_dialogue", "open", {
          scriptSegmentId: segment.id,
          found: "The script line exists.",
          notFound: "No spoken sentence covers it.",
          limits: "Speech to text can miss words.",
        }),
      ],
    });
    expect(screen.getByText("Phantom Dialogue")).toBeInTheDocument();
    expect(screen.getByText("(Script line not spoken)")).toBeInTheDocument();
    expect(screen.getByText("No spoken sentence covers it.")).toBeInTheDocument();
  });
});
