import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GuestAuthProvider } from "@/components/guest-auth-provider";
import {
  createGuestAuth,
  GUEST_AUTH_MESSAGES,
  GuestAuthError,
  type GuestAuth,
  type GuestAuthPort,
} from "@/lib/guest-auth";
import { EditorsPanel } from "./editors-panel";
import { detail } from "./test-fixtures";
import type { ProjectState } from "./use-project";

function stateWith(over: Partial<ProjectState> = {}): ProjectState {
  return {
    status: "done",
    detail,
    evidence: [],
    findings: [],
    errorMessage: undefined,
    reviewingId: undefined,
    reviewError: undefined,
    reviewErrorId: undefined,
    refresh: vi.fn(),
    review: vi.fn(async () => true),
    reshoot: vi.fn(async () => true),
    saveScript: vi.fn(),
    saveChecklist: vi.fn(async () => []),
    makeCopy: vi.fn(async () => "copy-1"),
    requestUploadUrl: vi.fn(),
    sync: vi.fn(async () => undefined),
    startAnalysis: vi.fn(),
    fetchJob: vi.fn(),
    ...over,
  };
}

/** A Supabase-mode guest auth whose sign-in the test controls. `log` records the order of calls. */
function guestAuth(log: string[], ensure: () => Promise<void> = async () => undefined): GuestAuth {
  return {
    mode: "supabase",
    ensureSession: vi.fn(async () => {
      log.push("sign-in");
      await ensure();
    }),
    prepareRequest: vi.fn(async () => undefined),
  };
}

describe("EditorsPanel", () => {
  it("shows the demo read-only with a note and makes an editable copy, then opens it", async () => {
    const navigate = vi.fn();
    const state = stateWith();
    render(<EditorsPanel state={state} navigate={navigate} />);
    expect(screen.getByRole("note")).toHaveTextContent("The demo is read-only.");
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    expect(state.makeCopy).toHaveBeenCalledWith("Copy of Test project");
    expect(navigate).toHaveBeenCalledWith("/projects/copy-1");
  });

  it("shows the server's error when the copy fails", async () => {
    const state = stateWith({
      makeCopy: vi.fn(async () => {
        throw new Error("Sign in to create a project.");
      }),
    });
    render(<EditorsPanel state={state} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in to create a project.");
    expect(screen.getByRole("button", { name: "Make an editable copy" })).toBeEnabled();
  });

  it("signs in as a guest before it makes the copy (Supabase mode)", async () => {
    const log: string[] = [];
    const auth = guestAuth(log);
    const state = stateWith({
      makeCopy: vi.fn(async () => {
        log.push("copy");
        return "copy-1";
      }),
    });
    const navigate = vi.fn();
    render(<EditorsPanel state={state} navigate={navigate} auth={auth} />);
    expect(screen.getByText(/guest session in this browser only/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/projects/copy-1"));
    expect(log).toEqual(["sign-in", "copy"]);
  });

  it("makes no copy when sign-in fails, says why, and lets the person try again", async () => {
    const log: string[] = [];
    const ensure = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new GuestAuthError("network"))
      .mockResolvedValueOnce(undefined);
    const state = stateWith();
    const navigate = vi.fn();
    render(<EditorsPanel state={state} navigate={navigate} auth={guestAuth(log, ensure)} />);
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(GUEST_AUTH_MESSAGES.network);
    expect(state.makeCopy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/projects/copy-1"));
    expect(state.makeCopy).toHaveBeenCalledTimes(1);
  });

  it("locks the button and makes one sign-in and one copy on a double click", async () => {
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const auth = guestAuth(log, () => gate);
    const state = stateWith();
    render(<EditorsPanel state={state} navigate={vi.fn()} auth={auth} />);
    const user = userEvent.setup();
    await user.dblClick(screen.getByRole("button", { name: "Make an editable copy" }));
    expect(await screen.findByRole("button", { name: "Starting a guest session..." })).toBeDisabled();
    release();
    await waitFor(() => expect(state.makeCopy).toHaveBeenCalledTimes(1));
    expect(auth.ensureSession).toHaveBeenCalledTimes(1);
  });

  it("uses the shared provider's sign-in: missing settings give an alert and no copy", async () => {
    const state = stateWith();
    render(
      <GuestAuthProvider config={{ mode: "supabase", url: null, anonKey: null }}>
        <EditorsPanel state={state} navigate={vi.fn()} />
      </GuestAuthProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(GUEST_AUTH_MESSAGES.not_configured);
    expect(state.makeCopy).not.toHaveBeenCalled();
  });

  it("makes no copy and no new guest when getUser says access_denied", async () => {
    const signInAnonymously = vi.fn();
    const signOut = vi.fn();
    const port = {
      getSession: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }),
      getUser: async () => ({ data: { user: null }, error: { name: "AuthApiError", status: 403, code: "access_denied" } }),
      signInAnonymously,
      signOut,
    } as unknown as GuestAuthPort;
    const state = stateWith();
    render(<EditorsPanel state={state} navigate={vi.fn()} auth={createGuestAuth(() => port)} />);
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(GUEST_AUTH_MESSAGES.failed);
    expect(state.makeCopy).not.toHaveBeenCalled();
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("shows no guest note and needs no sign-in in fixture mode", async () => {
    const state = stateWith();
    render(<EditorsPanel state={state} navigate={vi.fn()} />);
    expect(screen.queryByText(/guest session/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Make an editable copy" }));
    await waitFor(() => expect(state.makeCopy).toHaveBeenCalledTimes(1));
  });

  it("is editable with no copy button on a project the user owns", () => {
    render(
      <EditorsPanel
        state={stateWith({ detail: { ...detail, project: { ...detail.project, isDemo: false } } })}
        navigate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Make an editable copy" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox")[0]).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save checklist" })).toBeInTheDocument();
  });
});
