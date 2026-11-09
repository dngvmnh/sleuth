import { expect as baseExpect, test, type APIRequestContext } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Final Seal task 8 on an editable copy, fixture mode. Run with --workers=1.

async function copyWithReshoot(request: APIRequestContext) {
  const made = await request.post("/api/v1/projects", {
    data: { name: `Reshoot copy ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, copyFromDemo: true },
  });
  expect(made.status()).toBe(201);
  const id = ((await made.json()) as { project: { id: string } }).project.id;
  const detail = (await (await request.get(`/api/v1/projects/${id}`)).json()) as {
    checklist: { id: string; label: string; position: number }[];
  };
  const item = [...detail.checklist].sort((a, b) => a.position - b.position)[1]!; // "Create a new invoice"
  const created = await request.post(`/api/v1/projects/${id}/reshoots`, {
    data: { note: "Film the New Invoice click again.", checklistItemId: item.id },
  });
  expect(created.status()).toBe(201);
  const reshootId = ((await created.json()) as { reshoot: { id: string } }).reshoot.id;
  return { id, item, reshootId };
}

async function stateOf(request: APIRequestContext, projectId: string, itemId: string) {
  const cov = (await (await request.get(`/api/v1/projects/${projectId}/coverage`)).json()) as {
    coverage: { items: { checklistItemId: string; state: string }[] };
  };
  return cov.coverage.items.find((i) => i.checklistItemId === itemId)?.state;
}

test("Mark done closes the reshoot, stays done after a reload, and does not make the item proven", async ({
  page,
  request,
}) => {
  const { id, item, reshootId } = await copyWithReshoot(request);
  expect(await stateOf(request, id, item.id)).toBe("reshoot");

  await page.goto(`/projects/${id}/report`);
  const openList = page.getByRole("list", { name: "Open reshoots" });
  await expect(openList).toContainText("Film the New Invoice click again.");
  await expect(openList).toContainText(`Checklist item: ${item.label}`);
  const row = page.getByTestId("coverage-row").filter({ hasText: item.label });
  await expect(row.locator("[data-state]")).toHaveAttribute("data-state", "reshoot");

  const patched = page.waitForResponse((r) => r.url().endsWith(`/reshoots/${reshootId}`) && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Mark done: Film the New Invoice click again." }).click();
  expect((await patched).status()).toBe(200);

  const doneList = page.getByRole("list", { name: "Done reshoots" });
  await expect(doneList).toContainText("Film the New Invoice click again.");
  await expect(doneList.getByTestId("reshoot-status")).toHaveText("Done");
  await expect(page.getByText("No open reshoot tasks.")).toBeVisible();
  // Coverage was reloaded from the API: the item left "reshoot" but is not proven.
  await expect(row.locator("[data-state]")).toHaveAttribute("data-state", "needs_review");
  await expect(row.locator("[data-state]")).not.toHaveAttribute("data-state", "proven");

  await page.reload();
  await expect(page.getByRole("list", { name: "Done reshoots" })).toContainText("Film the New Invoice click again.");
  await expect(page.getByRole("button", { name: /^Mark done/ })).toHaveCount(0);
  const rowAfter = page.getByTestId("coverage-row").filter({ hasText: item.label });
  await expect(rowAfter.locator("[data-state]")).toHaveAttribute("data-state", "needs_review");

  // And the server agrees.
  expect(await stateOf(request, id, item.id)).toBe("needs_review");
  const list = (await (await request.get(`/api/v1/projects/${id}/reshoots`)).json()) as {
    reshoots: { id: string; status: string }[];
  };
  expect(list.reshoots.find((r) => r.id === reshootId)?.status).toBe("done");
});

test("a failed update shows the server's message and keeps the reshoot open", async ({ page, request }) => {
  const { id } = await copyWithReshoot(request);
  await page.route("**/api/v1/reshoots/*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "unavailable", message: "The store is not answering." } }),
    }),
  );
  await page.goto(`/projects/${id}/report`);
  await page.getByRole("button", { name: /^Mark done/ }).click();
  await expect(page.getByRole("list", { name: "Open reshoots" }).getByRole("alert")).toHaveText(
    "Could not update the reshoot: The store is not answering.",
  );
  await expect(page.getByRole("list", { name: "Open reshoots" })).toContainText("Film the New Invoice click again.");
});

test("the demo report is read-only: no Mark done, and it says why", async ({ page }) => {
  await page.goto("/projects/proofpay-demo/report");
  await expect(page.getByTestId("coverage-row").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Mark done/ })).toHaveCount(0);
  // Scoped to the reshoot section: the seal panel has its own read-only note (task 9).
  await expect(
    page.getByRole("region", { name: "Reshoots" }).getByText(/Read-only: only the owner of an editable copy/),
  ).toBeVisible();
  // The demo's outside-proof line is proposed by the software, not marked by a person.
  await expect(page.getByTestId("outside-proof").first()).toHaveAttribute("data-acknowledged", "false");
});

test("an outside-proof line marked by a person says so on the report", async ({ page, request }) => {
  const made = await request.post("/api/v1/projects", {
    data: { name: `Outside proof copy ${Date.now()}`, copyFromDemo: true },
  });
  const id = ((await made.json()) as { project: { id: string } }).project.id;
  const evidence = (await (await request.get(`/api/v1/projects/${id}/evidence`)).json()) as {
    evidence: { id: string; status: string }[];
  };
  const target = evidence.evidence.find((e) => e.status === "needs_outside_proof");
  expect(target).toBeDefined();
  const reviewed = await request.patch(`/api/v1/evidence/${target!.id}/review`, {
    data: { decision: "needs_outside_proof" },
  });
  expect(reviewed.status()).toBe(200);

  await page.goto(`/projects/${id}/report`);
  const item = page.getByTestId("outside-proof").first();
  await expect(item).toHaveAttribute("data-acknowledged", "true");
  await expect(item.getByTestId("outside-proof-status")).toHaveText(
    "Marked by a person: this needs proof from outside the video.",
  );
});
