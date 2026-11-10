import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoVideoPanel } from "./no-video-panel";

describe("NoVideoPanel", () => {
  it("says there is no video in fixture mode and that no footage plays", () => {
    render(<NoVideoPanel />);
    expect(screen.getByRole("heading", { name: "No video in fixture mode" })).toBeInTheDocument();
    expect(screen.getByText(/nothing here plays real footage/)).toBeInTheDocument();
    expect(screen.getByText(/simulated clock/)).toBeInTheDocument();
  });

  it("is a labelled region", () => {
    render(<NoVideoPanel />);
    expect(screen.getByRole("region", { name: "No video in fixture mode" })).toBeInTheDocument();
  });
});
