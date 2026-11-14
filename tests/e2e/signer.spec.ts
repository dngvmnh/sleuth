import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Issue #96: the sealed banner names the signer in words, never as a raw user id.
// Fixture mode, run with --workers=1. Each test seals its own copy of the demo.

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** A user id shaped like a real Supabase one, so the check means something in fixture mode. */
const SIGNER = "24c9177b-c629-4203-b740-f603ebe0646c";

/** Copy the demo, review everything a person must, and seal it, all as `user`. */
async function sealedCopy(request: APIRequestContext, user: string | null): Promise<string> {
  const headers: Record<string, string> = user ? { "x-fixture-user": user } : {};
  const made = await request.post("/api/v1/projects", {
    headers,
    data: { name: `Signer copy ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, copyFromDemo: true },
  });
  expect(made.status()).toBe(201);
  const id = ((await made.json()) as { project: { id: string } }).project.id;
  const ev = (await (await request.get(`/api/v1/projects/${id}/evidence`, { headers })).json()) as {
    evidence: { id: string; status: string }[];
  };
  for (const e of ev.evidence) {
    const decision = e.status === "needs_outside_proof" ? "needs_outside_proof" : "confirm";
    expect((await request.patch(`/api/v1/evidence/${e.id}/review`, { headers, data: { decision } })).status()).toBe(200);
  }
  const cov = (await (await request.get(`/api/v1/projects/${id}/coverage`, { headers })).json()) as {
    coverage: { items: { checklistItemId: string; state: string }[] };
  };
  for (const item of cov.coverage.items.filter((i) => i.state === "uncovered")) {
    const res = await request.post(`/api/v1/projects/${id}/reshoots`, {
      headers,
      data: { note: "Film this step.", checklistItemId: item.checklistItemId },
    });
    expect(res.status()).toBe(201);
  }
  const sealed = await request.post(`/api/v1/projects/${id}/seal`, { headers, data: { note: "Checked by hand." } });
  expect(sealed.status()).toBe(201);
  return id;
}

/** The banner's visible text, without the closed "Audit id" box. */
const visibleBanner = (page: Page) => page.getByTestId("seal-banner").evaluate((el) => (el as HTMLElement).innerText);

test("a sealed banner signed with a UUID-shaped id shows no id in its visible text", async ({ page, request }) => {
  const id = await sealedCopy(request, SIGNER);
  // The browser acts as the same user, so it may read the project.
  await page.setExtraHTTPHeaders({ "x-fixture-user": SIGNER });
  await page.goto(`/projects/${id}/report`);
  const banner = page.getByTestId("seal-banner");
  await expect(banner).toHaveAttribute("data-status", "sealed");
  await expect(banner).toContainText(/Signed off by (you|the project owner|a reviewer) at/);
  const text = await visibleBanner(page);
  expect(text).not.toMatch(UUID_PATTERN);
  expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  // The id is still there for auditors, inside a closed details box.
  const audit = banner.getByTestId("seal-audit-id");
  await expect(audit).not.toHaveAttribute("open", "");
  await audit.locator("summary").click();
  await expect(audit).toContainText(SIGNER);
});

test("the person who sealed sees Signed off by you", async ({ page, request }) => {
  const id = await sealedCopy(request, null);
  await page.goto(`/projects/${id}/report`);
  await expect(page.getByTestId("seal-banner")).toContainText("Signed off by you at");
  expect(await visibleBanner(page)).not.toMatch(UUID_PATTERN);
});

test("report.csv and report.html say who signed in words", async ({ request }) => {
  const id = await sealedCopy(request, SIGNER);
  const headers = { "x-fixture-user": SIGNER };
  const csv = await (await request.get(`/api/v1/projects/${id}/report.csv`, { headers })).text();
  expect(csv).toContain("Sign-off,Sealed by the project owner at");
  expect(csv).toContain(`Signer id (audit),${SIGNER}`);
  const html = await (await request.get(`/api/v1/projects/${id}/report.html`, { headers })).text();
  expect(html).toContain("Sealed by the project owner at");
  expect(html.replace(/<details>[\s\S]*?<\/details>/, "")).not.toMatch(UUID_PATTERN);
});
