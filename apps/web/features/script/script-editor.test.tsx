import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CreateScriptResponse } from "@sleuth/contracts";
import { ScriptEditor } from "./script-editor";

const HASH = "c".repeat(64);
const seg = (id: string, index: number, text: string) => ({ id, scriptVersionId: "sv2", index, text, hash: HASH });

function response(over: Partial<CreateScriptResponse> = {}): CreateScriptResponse {
  return {
    scriptVersion: {
      id: "sv2",
      projectId: "p1",
      version: 2,
      text: "Hello there. Click Save.",
      segments: [seg("s1", 0, "Hello there."), seg("s2", 1, "Click Save.")],
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    diff: { added: [], modified: ["s2"], removed: [], unchanged: ["s1"] },
    staleEvidenceIds: ["e2"],
    ...over,
  };
}

function show(props: Partial<React.ComponentProps<typeof ScriptEditor>> = {}) {
  const onSave = vi.fn(async () => response());
  render(<ScriptEditor text="Hello there. Click Export." readOnly={false} onSave={onSave} {...props} />);
  return { onSave, user: userEvent.setup(), field: screen.getByRole("textbox") };
}

describe("ScriptEditor", () => {
  it("cannot save until the text changes", () => {
    show();
    expect(screen.getByRole("button", { name: "Save script" })).toBeDisabled();
    expect(screen.getByText("No unsaved changes.")).toBeInTheDocument();
  });

  it("posts the edited text and shows the changed line and the stale evidence from the response", async () => {
    const { onSave, user, field } = show();
    await user.clear(field);
    await user.type(field, "Hello there. Click Save.");
    await user.click(screen.getByRole("button", { name: "Save script" }));
    expect(onSave).toHaveBeenCalledWith("Hello there. Click Save.");
    const summary = await screen.findByTestId("script-save-summary");
    expect(summary).toHaveTextContent("Saved as version 2.");
    expect(screen.getByRole("list", { name: "Changed lines" })).toHaveTextContent("Line 2 changed: Click Save.");
    expect(screen.getByRole("list", { name: "Changed lines" })).not.toHaveTextContent("Line 1");
    expect(screen.getByTestId("stale-summary")).toHaveTextContent(
      "1 evidence candidate is now out of date (Poltergeist, Evidence out of date).",
    );
  });

  it("says no evidence affected when the server reports nothing stale", async () => {
    const onSave = vi.fn(async () =>
      response({ diff: { added: [], modified: [], removed: [], unchanged: ["s1", "s2"] }, staleEvidenceIds: [] }),
    );
    const { user, field } = show({ onSave });
    await user.type(field, "!");
    await user.click(screen.getByRole("button", { name: "Save script" }));
    expect(await screen.findByTestId("stale-summary")).toHaveTextContent("No evidence affected.");
    expect(screen.getByText("No line changed in a way that matters for evidence.")).toBeInTheDocument();
  });

  it("lists added and removed lines from the diff", async () => {
    const onSave = vi.fn(async () =>
      response({ diff: { added: ["s2"], modified: [], removed: ["s9", "s8"], unchanged: ["s1"] }, staleEvidenceIds: [] }),
    );
    const { user, field } = show({ onSave });
    await user.type(field, " More.");
    await user.click(screen.getByRole("button", { name: "Save script" }));
    const list = await screen.findByRole("list", { name: "Changed lines" });
    expect(list).toHaveTextContent("Line 2 added: Click Save.");
    expect(list).toHaveTextContent("2 lines removed");
  });

  it("shows the server's error and keeps the draft", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("The demo project is read-only. Create your own project.");
    });
    const { user, field } = show({ onSave });
    await user.type(field, " More.");
    await user.click(screen.getByRole("button", { name: "Save script" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The demo project is read-only. Create your own project.");
    expect(field).toHaveValue("Hello there. Click Export. More.");
  });

  it("sends one save while a save is running", async () => {
    let release: (r: CreateScriptResponse) => void = () => undefined;
    const onSave = vi.fn(
      () =>
        new Promise<CreateScriptResponse>((resolve) => {
          release = resolve;
        }),
    );
    const { user, field } = show({ onSave });
    await user.type(field, " More.");
    await user.click(screen.getByRole("button", { name: "Save script" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saving..." }));
    expect(onSave).toHaveBeenCalledTimes(1);
    release(response());
    expect(await screen.findByTestId("script-save-summary")).toBeInTheDocument();
  });

  it("is read-only with no save button on the demo", () => {
    show({ readOnly: true });
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save script" })).not.toBeInTheDocument();
  });
});
