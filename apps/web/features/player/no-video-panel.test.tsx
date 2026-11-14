import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoVideoPanel } from "./no-video-panel";

describe("NoVideoPanel", () => {
  it("says there is no playable video file and that nothing plays", () => {
    render(<NoVideoPanel />);
    expect(screen.getByRole("heading", { name: "No playable video file" })).toBeInTheDocument();
    expect(screen.getByText(/has no video file to play/)).toBeInTheDocument();
    expect(screen.getByText(/simulated clock/)).toBeInTheDocument();
  });

  it("is a labelled region", () => {
    render(<NoVideoPanel />);
    expect(screen.getByRole("region", { name: "No playable video file" })).toBeInTheDocument();
  });
});
