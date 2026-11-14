import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverageBar } from "./coverage-bar";

describe("CoverageBar", () => {
  it("says covered, never confirmed, and exposes the number", () => {
    render(<CoverageBar covered={2} total={5} />);
    expect(screen.getByText("2 of 5 script lines covered")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Script lines covered" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar.firstElementChild).toHaveStyle({ width: "40%" });
  });

  it("handles a script with no lines", () => {
    render(<CoverageBar covered={0} total={0} />);
    expect(screen.getByText("0 of 0 script lines covered")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "0%" });
  });

  it("uses the singular for one line", () => {
    render(<CoverageBar covered={1} total={1} />);
    expect(screen.getByText("1 of 1 script line covered")).toBeInTheDocument();
  });
});