import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";
import { FindingBadge } from "@/components/finding-badge";
import ErrorPage from "./error";
import NotFound from "./not-found";
import { RouteLoading } from "@/components/route-loading";

describe("not-found page", () => {
  it("is a locked door: themed heading, a plain line and a way back", () => {
    render(<NotFound />);
    expect(screen.getByText("A locked door")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This room is empty.");
    expect(screen.getByText("We could not find that page.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the dashboard" })).toHaveAttribute("href", "/");
  });
});

describe("route loading", () => {
  it.each(["workspace", "report"] as const)("shows forest-panel skeletons for the %s, named for screen readers", (layout) => {
    const { container } = render(<RouteLoading label="Opening the page" layout={layout} />);
    expect(screen.getByRole("status", { name: "Opening the page" })).toBeInTheDocument();
    expect(container.querySelectorAll(".panel").length).toBeGreaterThan(1);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});

describe("error page", () => {
  it("offers a retry and never prints the error text", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("secret internal detail")} reset={reset} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Something creaked.");
    expect(screen.getByText("This page could not load. Nothing you saved was lost.")).toBeInTheDocument();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to the dashboard" })).toHaveAttribute("href", "/");
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