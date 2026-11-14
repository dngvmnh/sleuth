import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";
import { FindingBadge } from "@/components/finding-badge";
import ErrorPage from "./error";
import NotFound from "./not-found";

describe("not-found page", () => {
  it("says the page is missing and links back to the projects", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page vanished");
    expect(screen.getByRole("link", { name: "Back to your projects" })).toHaveAttribute("href", "/");
  });
});

describe("error page", () => {
  it("offers a retry and never prints the error text", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("secret internal detail")} reset={reset} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to your projects" })).toHaveAttribute("href", "/");
  });
});

describe("FindingBadge", () => {
  const types = Object.keys(FINDING_LABELS) as FindingType[];
  it.each(types)("shows the icon, the spooky name and the plain name for %s", (type) => {
    const { container } = render(<FindingBadge type={type} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container).toHaveTextContent(FINDING_LABELS[type].spooky);
    expect(container).toHaveTextContent(`(${FINDING_LABELS[type].plain})`);
  });
});