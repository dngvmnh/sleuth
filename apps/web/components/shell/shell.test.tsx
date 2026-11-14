import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/lib/api-client";
import { createFixtureGuestAuth, type GuestAuth } from "@/lib/guest-auth";
import { Corner, GroundMist, LanternCursor, OrnamentDivider, PanelCorners } from "@/components/ornaments";
import { IdentityChip } from "./identity-chip";
import { OpenFindingsChip } from "./open-findings-chip";
import { SaveStatusIndicator, SaveStatusProvider, useSaveStatus } from "./save-status";
import { KEY_HINTS, SiteFooter } from "./site-footer";
import { navItems, projectIdOf, SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

type Findings = { status: string }[];

function fakeClient(projects: string[], findings: Record<string, Findings | Error>): ApiClient {
  return {
    listProjects: vi.fn(async () => ({ projects: projects.map((id) => ({ id })) })),
    listFindings: vi.fn(async (id: string) => {
      const f = findings[id];
      if (f instanceof Error) throw f;
      return { findings: f ?? [] };
    }),
  } as unknown as ApiClient;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("open-findings chip", () => {
  it("shows the real total of open findings across projects", async () => {
    const client = fakeClient(["a", "b"], {
      a: [{ status: "open" }, { status: "resolved" }, { status: "open" }],
      b: [{ status: "open" }],
    });
    render(<OpenFindingsChip refreshKey="/" client={client} />);
    expect(await screen.findByTestId("open-findings-chip")).toHaveTextContent("3 open findings across your projects");
  });

  it("is hidden while counting", () => {
    const client = { listProjects: () => new Promise(() => undefined) } as unknown as ApiClient;
    render(<OpenFindingsChip refreshKey="/" client={client} />);
    expect(screen.queryByTestId("open-findings-chip")).toBeNull();
  });

  it("is hidden when any project fails, instead of showing a partial number", async () => {
    const client = fakeClient(["a", "b"], { a: [{ status: "open" }], b: new Error("500") });
    render(<OpenFindingsChip refreshKey="/" client={client} />);
    await waitFor(() => expect(client.listFindings).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    expect(screen.queryByTestId("open-findings-chip")).toBeNull();
  });

  it("is hidden when the project list fails", async () => {
    const client = { listProjects: vi.fn(async () => Promise.reject(new Error("offline"))) } as unknown as ApiClient;
    render(<OpenFindingsChip refreshKey="/" client={client} />);
    await waitFor(() => expect(client.listProjects).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByTestId("open-findings-chip")).toBeNull();
  });
});

describe("site navigation", () => {
  it("marks the dashboard as the current page and offers no Report outside a project", () => {
    expect(navItems("/")).toEqual([
      { label: "Dashboard", href: "/", current: true },
      { label: "Findings guide", href: "/#findings-guide", current: false },
    ]);
  });

  it("adds Report inside a project and marks it current on the report page", () => {
    expect(projectIdOf("/projects/proofpay-demo")).toBe("proofpay-demo");
    const inWorkspace = navItems("/projects/proofpay-demo");
    expect(inWorkspace.map((i) => [i.label, i.current])).toEqual([
      ["Dashboard", false],
      ["Findings guide", false],
      ["Report", false],
    ]);
    expect(inWorkspace[2]?.href).toBe("/projects/proofpay-demo/report");
    expect(navItems("/projects/proofpay-demo/report")[2]?.current).toBe(true);
  });
});

describe("site header", () => {
  it("renders the wordmark, the nav with aria-current, and the Night wind toggle switched off", () => {
    // No network in unit tests: the chip's count fails and so stays hidden.
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    render(
      <SaveStatusProvider>
        <SiteHeader />
      </SaveStatusProvider>,
    );
    expect(screen.getByRole("link", { name: "SLEUTH home" })).toHaveAttribute("href", "/");
    const nav = screen.getByRole("navigation", { name: "Site navigation" });
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("link", { name: "Report" })).toBeNull();
    expect(screen.getByRole("button", { name: "Night wind: off" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("banner").textContent).not.toMatch(/level|xp|quest|unlock|achievement/i);
    vi.unstubAllGlobals();
  });
});

describe("identity chip", () => {
  const withKind = (kind: "visitor" | "guest" | "team"): GuestAuth => ({
    ...createFixtureGuestAuth(),
    reviewerKind: async () => kind,
  });

  it.each([
    ["visitor", "Guest reviewer"],
    ["guest", "Guest reviewer"],
    ["team", "Team reviewer"],
  ] as const)("names a %s plainly", async (kind, title) => {
    render(<IdentityChip refreshKey="/" auth={withKind(kind)} />);
    const chip = screen.getByTestId("identity-chip");
    await waitFor(() => expect(chip.textContent).toContain(title));
    expect(chip.textContent).not.toMatch(/level|xp|quest|unlock|achievement/i);
  });
});

function SaveButton({ save }: { save: () => Promise<unknown> }) {
  const { track } = useSaveStatus();
  return (
    <button type="button" onClick={() => void track(save()).catch(() => undefined)}>
      save
    </button>
  );
}

describe("save status", () => {
  it("shows nothing until something is saved, then Saving… and Saved", async () => {
    const pending = deferred<void>();
    render(
      <SaveStatusProvider>
        <SaveButton save={() => pending.promise} />
        <SaveStatusIndicator />
      </SaveStatusProvider>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    expect(status).toHaveTextContent("Saving…");
    await act(async () => pending.resolve());
    expect(status).toHaveTextContent("Saved");
  });

  it("never says Saved after a failed save", async () => {
    const pending = deferred<void>();
    render(
      <SaveStatusProvider>
        <SaveButton save={() => pending.promise} />
        <SaveStatusIndicator />
      </SaveStatusProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await act(async () => pending.reject(new Error("409")));
    expect(screen.getByRole("status")).toHaveTextContent("Not saved");
    expect(screen.getByRole("status")).not.toHaveTextContent(/^Saved/);
  });

  it("keeps Saving… while a second save is still running", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const saves = [first, second];
    render(
      <SaveStatusProvider>
        <SaveButton save={() => (saves.shift() as ReturnType<typeof deferred<void>>).promise} />
        <SaveStatusIndicator />
      </SaveStatusProvider>,
    );
    const button = screen.getByRole("button", { name: "save" });
    await userEvent.click(button);
    await userEvent.click(button);
    await act(async () => first.resolve());
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    await act(async () => second.resolve());
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("passes the save's own result and error through unchanged, even without a provider", async () => {
    let seen: unknown;
    function Probe() {
      const { track } = useSaveStatus();
      return (
        <button type="button" onClick={() => void track(Promise.resolve(42)).then((v) => (seen = v))}>
          probe
        </button>
      );
    }
    render(<Probe />);
    await userEvent.click(screen.getByRole("button", { name: "probe" }));
    await waitFor(() => expect(seen).toBe(42));
  });
});

describe("site footer", () => {
  it("lists only keys that work, with spoken names, and the motto", () => {
    render(
      <SaveStatusProvider>
        <SiteFooter />
      </SaveStatusProvider>,
    );
    const list = screen.getByRole("list", { name: "Keyboard keys" });
    expect(list).toHaveTextContent("Left and Right arrow keys:");
    expect(list).toHaveTextContent("Move between markers");
    expect(list).toHaveTextContent("Escape:");
    expect(list).toHaveTextContent("Back to the script");
    expect(KEY_HINTS.map((k) => k.keys.join(" "))).toEqual(["← →", "Esc", "Tab"]);
    expect(screen.getByText(/Every claim needs proof/)).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveAttribute("data-print", "hide");
  });
});

describe("ornaments and atmosphere", () => {
  it("are all hidden from screen readers and never clickable", () => {
    const { container } = render(
      <div>
        <Corner position="top-left" />
        <PanelCorners />
        <OrnamentDivider glyph="key" />
        <GroundMist />
        <LanternCursor />
      </div>,
    );
    const root = container.firstElementChild as HTMLElement;
    for (const child of Array.from(root.children)) expect(child.getAttribute("aria-hidden")).toBe("true");
    expect(root.children).toHaveLength(8);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it("lights the lantern only for a mouse, once a frame", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const { container } = render(
      <div data-testid="hero">
        <LanternCursor />
      </div>,
    );
    const hero = screen.getByTestId("hero");
    const layer = container.querySelector(".sleuth-lantern") as HTMLElement;
    const move = (pointerType: string) => {
      const event = new MouseEvent("pointermove", { clientX: 40, clientY: 30, bubbles: true });
      Object.defineProperty(event, "pointerType", { value: pointerType });
      hero.dispatchEvent(event);
    };
    move("touch");
    expect(layer.dataset.lit).toBeUndefined();
    move("mouse");
    expect(layer.dataset.lit).toBe("true");
    expect(layer.style.getPropertyValue("--lantern-x")).toBe("40px");
    raf.mockRestore();
  });
});
