import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChecklistItem } from "@sleuth/contracts";
import { ChecklistEditor } from "./checklist-editor";

const items: ChecklistItem[] = [
  { id: "c2", projectId: "p1", label: "Export a PDF", position: 1 },
  { id: "c1", projectId: "p1", label: "Create an invoice", position: 0 },
];

function show(props: Partial<React.ComponentProps<typeof ChecklistEditor>> = {}) {
  const onSave = vi.fn(async () => []);
  render(<ChecklistEditor items={items} readOnly={false} onSave={onSave} {...props} />);
  return { onSave, user: userEvent.setup() };
}

const labels = () =>
  within(screen.getByRole("list", { name: "Checklist items" }))
    .getAllByRole("listitem")
    .map((li) => li.querySelector("span:nth-child(2)")?.textContent);

describe("ChecklistEditor", () => {
  it("lists items in their saved order", () => {
    show();
    expect(labels()).toEqual(["Create an invoice", "Export a PDF"]);
  });

  it("adds an item with the button or Enter", async () => {
    const { user } = show();
    const input = screen.getByLabelText("New item");
    await user.type(input, "Show the total");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(input, "Send the invoice{Enter}");
    expect(labels()).toEqual(["Create an invoice", "Export a PDF", "Show the total", "Send the invoice"]);
    expect(input).toHaveValue("");
  });

  it("does not add an empty item", async () => {
    const { user } = show();
    await user.type(screen.getByLabelText("New item"), "   ");
    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
  });

  it("removes an item", async () => {
    const { user } = show();
    await user.click(screen.getByRole("button", { name: 'Remove "Create an invoice"' }));
    expect(labels()).toEqual(["Export a PDF"]);
  });

  it("reorders with Up and Down, and the ends cannot move further", async () => {
    const { user } = show();
    expect(screen.getByRole("button", { name: 'Move "Create an invoice" up' })).toBeDisabled();
    expect(screen.getByRole("button", { name: 'Move "Export a PDF" down' })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: 'Move "Export a PDF" up' }));
    expect(labels()).toEqual(["Export a PDF", "Create an invoice"]);
    expect(screen.getByRole("status")).toHaveTextContent('Moved "Export a PDF" to position 1. Not saved yet.');
  });

  it("saves the whole list in its new order", async () => {
    const { onSave, user } = show();
    await user.click(screen.getByRole("button", { name: 'Move "Create an invoice" down' }));
    await user.type(screen.getByLabelText("New item"), "Show the total{Enter}");
    await user.click(screen.getByRole("button", { name: "Save checklist" }));
    expect(onSave).toHaveBeenCalledWith(["Export a PDF", "Create an invoice", "Show the total"]);
    expect(await screen.findByText("Checklist saved with 3 items.")).toBeInTheDocument();
  });

  it("cannot save an empty list", async () => {
    const { user } = show();
    await user.click(screen.getByRole("button", { name: 'Remove "Create an invoice"' }));
    await user.click(screen.getByRole("button", { name: 'Remove "Export a PDF"' }));
    expect(screen.getByRole("button", { name: "Save checklist" })).toBeDisabled();
    expect(screen.getByText("Add at least one item to save.")).toBeInTheDocument();
  });

  it("shows the server's error and keeps the edited list", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("Not allowed.");
    });
    const { user } = show({ onSave });
    await user.click(screen.getByRole("button", { name: 'Remove "Export a PDF"' }));
    await user.click(screen.getByRole("button", { name: "Save checklist" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed.");
    expect(labels()).toEqual(["Create an invoice"]);
  });

  it("has no edit controls on the demo", () => {
    show({ readOnly: true });
    expect(labels()).toEqual(["Create an invoice", "Export a PDF"]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByLabelText("New item")).not.toBeInTheDocument();
  });
});
