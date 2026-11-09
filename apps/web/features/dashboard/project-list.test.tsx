import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Finding, Project } from "@sleuth/contracts";
import { createApiClient } from "@/lib/api-client";
import { ProjectList } from "./project-list";
import { formatLastChange } from "./use-dashboard";

const demo: Project = {
  id: "proofpay-demo",
  name: "ProofPay demo",
  ownerId: null,
  isDemo: true,
  currentScriptVersionId: null,
  currentAssetVersionId: null,
  createdAt: "2026-01-02T03:04:05.000Z",
  updatedAt: "2026-01-02T03:04:05.000Z",
};

const copy: Project = {
  ...demo,
  id: "copy-1",
  name: "Copy of ProofPay demo",
  ownerId: "user-1",
  isDemo: false,
  createdAt: "2026-03-04T00:00:00.000Z",
  updatedAt: "2026-04-10T09:30:00.000Z",
};

function finding(id: string, projectId: string, status: "open" | "resolved"): Finding {
  return {
    id,
    projectId,
    type: "ghost",
    plainLabel: "No visual evidence",
    checklistItemId: null,
    scriptSegmentId: null,
    evidenceId: null,
    found: "x",
    notFound: "y",
    limits: "z",
    status,
    analysisRunId: "run-1",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function clientWith(handler: Handler) {
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => handler(String(url), init));
  return { client: createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl };
}

const noFindings: Handler = (url) =>
  url.endsWith("/findings") ? json({ findings: [] }) : json({ projects: [] });

describe("ProjectList", () => {
  it("shows a loading state while projects load", () => {
    const { client } = clientWith(() => new Promise<Response>(() => undefined) as never);
    render(<ProjectList client={client} />);
    expect(screen.getByRole("status", { name: "Loading projects" })).toBeInTheDocument();
  });

  it("shows an empty state with a create action", async () => {
    const { client } = clientWith(noFindings);
    render(<ProjectList client={client} />);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a project" })).toBeEnabled();
  });

  it("shows the demo with a link to the project page", async () => {
    const { client } = clientWith((url) =>
      url.endsWith("/findings") ? json({ findings: [] }) : json({ projects: [demo] }),
    );
    render(<ProjectList client={client} />);
    expect(await screen.findByText("Public demo, read-only")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ProofPay demo" })).toHaveAttribute(
      "href",
      "/projects/proofpay-demo",
    );
    expect(screen.getByRole("link", { name: /Open demo/ })).toBeInTheDocument();
  });

  it("shows an error and loads the list after retry", async () => {
    let listCalls = 0;
    const { client, fetchImpl } = clientWith((url) => {
      if (url.endsWith("/findings")) return json({ findings: [] });
      listCalls += 1;
      return listCalls === 1
        ? json({ error: { code: "boom", message: "Server down" } }, 500)
        : json({ projects: [demo] });
    });
    render(<ProjectList client={client} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server down");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Public demo, read-only")).toBeInTheDocument();
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith("/projects"))).toHaveLength(2);
  });

  it("shows a creation error and keeps the create button usable", async () => {
    const { client } = clientWith((url, init) =>
      init?.method === "POST"
        ? json({ error: { code: "denied", message: "Not allowed" } }, 403)
        : noFindings(url),
    );
    render(<ProjectList client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Create a project" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not create the project: Not allowed"),
    );
    expect(screen.getByRole("button", { name: "Create a project" })).toBeEnabled();
  });

  it("reloads the list and shows the new copy after a successful create", async () => {
    let created = false;
    const { client } = clientWith((url, init) => {
      if (init?.method === "POST") {
        created = true;
        return json({ project: copy }, 201);
      }
      if (url.endsWith("/findings")) return json({ findings: [] });
      return json({ projects: created ? [demo, copy] : [] });
    });
    render(<ProjectList client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Create a project" }));
    expect(await screen.findByRole("link", { name: "Copy of ProofPay demo" })).toHaveAttribute(
      "href",
      "/projects/copy-1",
    );
    expect(screen.queryByText("No projects yet")).not.toBeInTheDocument();
  });

  it("locks the button and sends one POST while a create is pending", async () => {
    let release: (r: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { client, fetchImpl } = clientWith((url, init) =>
      init?.method === "POST" ? (pending as never) : noFindings(url),
    );
    render(<ProjectList client={client} />);
    const user = userEvent.setup();
    const button = await screen.findByRole("button", { name: "Create a project" });
    await user.click(button);
    const busy = await screen.findByRole("button", { name: "Creating..." });
    expect(busy).toBeDisabled();
    await user.click(busy);
    await user.dblClick(busy);
    expect(fetchImpl.mock.calls.filter(([, i]) => i?.method === "POST")).toHaveLength(1);
    release(json({ project: copy }, 201));
    await waitFor(() => expect(fetchImpl.mock.calls.filter(([, i]) => i?.method === "POST")).toHaveLength(1));
  });

  it("counts only open findings for each project", async () => {
    const { client } = clientWith((url) => {
      if (url.endsWith("/projects")) return json({ projects: [demo] });
      return json({
        findings: [
          finding("f1", "proofpay-demo", "open"),
          finding("f2", "proofpay-demo", "open"),
          finding("f3", "proofpay-demo", "resolved"),
        ],
      });
    });
    render(<ProjectList client={client} />);
    expect(await screen.findByText(/2 open findings/)).toBeInTheDocument();
  });

  it("shows no number when the findings request fails", async () => {
    const { client } = clientWith((url) =>
      url.endsWith("/projects")
        ? json({ projects: [demo] })
        : json({ error: { code: "boom", message: "nope" } }, 500),
    );
    render(<ProjectList client={client} />);
    const row = (await screen.findByRole("link", { name: "ProofPay demo" })).closest("li");
    expect(row).not.toBeNull();
    expect(await within(row as HTMLElement).findByText(/Open findings unavailable/)).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText(/^\d+ open/)).not.toBeInTheDocument();
  });

  it("keeps the order the API returns, even when a later row changed more recently", async () => {
    const older = { ...copy, id: "copy-old", name: "Older copy", updatedAt: "2026-02-01T00:00:00.000Z" };
    const newer = { ...copy, id: "copy-new", name: "Newer copy", updatedAt: "2026-05-01T00:00:00.000Z" };
    // The API puts the demo first, then by last change. The UI must not re-sort.
    const { client } = clientWith((url) =>
      url.endsWith("/findings") ? json({ findings: [] }) : json({ projects: [demo, newer, older] }),
    );
    render(<ProjectList client={client} />);
    await screen.findByText("Public demo, read-only");
    const names = screen
      .getAllByRole("listitem")
      .map((li) => within(li).getAllByRole("link")[0]?.textContent);
    expect(names).toEqual(["ProofPay demo", "Newer copy", "Older copy"]);
  });

  it("shows Last change from updatedAt, not the creation date", async () => {
    const { client } = clientWith((url) =>
      url.endsWith("/findings") ? json({ findings: [] }) : json({ projects: [demo, copy] }),
    );
    render(<ProjectList client={client} />);
    const row = (await screen.findByRole("link", { name: "Copy of ProofPay demo" })).closest("li") as HTMLElement;
    expect(row).toHaveTextContent("Last change 2026-04-10 09:30 UTC");
    expect(row).not.toHaveTextContent("2026-03-04");
    expect(within(row).getByText("2026-04-10 09:30 UTC")).toHaveAttribute("datetime", "2026-04-10T09:30:00.000Z");
  });
});

describe("formatLastChange", () => {
  it("shows the time in UTC to the minute", () => {
    expect(formatLastChange("2026-11-09T14:03:59.999Z")).toBe("2026-11-09 14:03 UTC");
  });

  it("says unknown for a value that is not a date", () => {
    expect(formatLastChange("not a date")).toBe("unknown");
  });
});
