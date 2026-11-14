import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { clientFor, detail, json, notFoundBody, okRoutes } from "./test-fixtures";
import { Workspace } from "./workspace";

describe("Workspace", () => {
  it("shows a loading state first", () => {
    const { client } = clientFor({ project: () => new Promise<Response>(() => undefined) });
    render(<Workspace projectId="p1" client={client} />);
    expect(screen.getByRole("status", { name: "Loading project" })).toBeInTheDocument();
  });

  it("shows the real script in order, the counts and the labelled regions", async () => {
    const { client } = clientFor(okRoutes());
    render(<Workspace projectId="p1" client={client} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Test project" })).toBeInTheDocument();

    const script = screen.getByRole("heading", { name: "Script" }).closest("section") as HTMLElement;
    const items = within(script).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1.Hello there.");
    expect(items[0]).toHaveTextContent("Cursed Frame (Needs human check)");
    expect(items[1]).toHaveTextContent("2.Click Export.");
    expect(items[1]).toHaveTextContent("Ghost (No visual evidence)");

    expect(screen.getByTestId("workspace-counts")).toHaveTextContent(
      "2 evidence candidates, 2 findings (1 open)",
    );
    expect(screen.getByText("Public demo, read-only")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Evidence Lantern" })).toBeInTheDocument();
  });

  it("plays the real video, and hides the simulated clock, when the server gives a playback URL", async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { client, calls } = clientFor(
      okRoutes({ playback: () => json({ url: "https://files.example.test/v.mp4?token=t", expiresAt }) }),
    );
    render(<Workspace projectId="p1" client={client} />);
    const video = await screen.findByLabelText("Project video");
    expect(video).toHaveAttribute("src", "https://files.example.test/v.mp4?token=t");
    expect(screen.queryByText("Simulated clock (not video)")).toBeNull();
    expect(screen.queryByRole("heading", { name: "No playable video file" })).toBeNull();
    expect(calls.some((c) => c.url.endsWith("/projects/p1/assets/av1/playback-url"))).toBe(true);
  });

  it("falls back to the simulated clock when the playback request fails", async () => {
    const { client } = clientFor(okRoutes({ playback: () => json({ error: { code: "x", message: "x" } }, 500) }));
    render(<Workspace projectId="p1" client={client} />);
    expect(await screen.findByRole("heading", { name: "No playable video file" })).toBeInTheDocument();
    expect(screen.getByText("Simulated clock (not video)")).toBeInTheDocument();
  });

  it("says there is no video and shows only a simulated clock", async () => {
    const { client } = clientFor(okRoutes());
    render(<Workspace projectId="p1" client={client} />);
    expect(await screen.findByRole("heading", { name: "No playable video file" })).toBeInTheDocument();
    expect(screen.getByText("Simulated clock (not video)")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("shows each open finding type with its plain-English label beside it", async () => {
    const { client } = clientFor(okRoutes());
    render(<Workspace projectId="p1" client={client} />);
    const panel = (await screen.findByRole("heading", { name: "Findings" })).closest("section");
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByText(/Ghost/)).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText("(No visual evidence)")).toBeInTheDocument();
    // The resolved Cursed Frame finding is not counted as open.
    expect(within(panel as HTMLElement).queryByText(/Cursed Frame/)).not.toBeInTheDocument();
  });

  it("shows an empty state, not invented findings, when there is no script or evidence", async () => {
    const { client } = clientFor(
      okRoutes({
        project: () => json({ ...detail, scriptVersion: null, assetVersion: null }),
        evidence: () => json({ evidence: [] }),
        findings: () => json({ findings: [] }),
      }),
    );
    render(<Workspace projectId="p1" client={client} />);
    expect(await screen.findByText("Nothing to review yet")).toBeInTheDocument();
    expect(screen.getByText(/This project has no script yet/)).toBeInTheDocument();
    expect(screen.getByText("No findings for this project.")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-counts")).toHaveTextContent(
      "0 evidence candidates, 0 findings (0 open)",
    );
  });

  it("shows project not found with a way back", async () => {
    const { client } = clientFor(okRoutes({ project: () => json(notFoundBody, 404) }));
    render(<Workspace projectId="nope" client={client} />);
    expect(await screen.findByRole("heading", { name: "Project not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/");
  });

  it("shows an error with retry, and loads the project after retry", async () => {
    let fail = true;
    const { client } = clientFor(
      okRoutes({
        project: () =>
          fail ? json({ error: { code: "boom", message: "Server down" } }, 500) : json(detail),
      }),
    );
    render(<Workspace projectId="p1" client={client} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server down");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Test project" })).toBeInTheDocument();
  });
});
