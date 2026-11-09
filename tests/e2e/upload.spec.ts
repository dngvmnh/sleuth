import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// Dev mode compiles routes on first visit; give pages time to appear. Assertions are unchanged.
const expect = baseExpect.configure({ timeout: 30_000 });

// Run with --workers=1: the fixture store lives in the dev server's memory.
// No real video file is committed, so the browser's media metadata is stubbed: setting `src`
// on a <video> fires `loadedmetadata` with the length in window.__videoSeconds. The app's own
// duration reader, limit check and upload flow run unchanged.

const line = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^${n}\\.`) });
const upload = (page: Page) => page.locator("section[aria-labelledby='upload-heading']");
const fakeVideo = (name: string) => ({ name, mimeType: "video/mp4", buffer: Buffer.from("not really a video") });

async function stubVideoLength(page: Page, seconds: number) {
  await page.addInitScript((s) => {
    (window as unknown as { __videoSeconds: number }).__videoSeconds = s;
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get: () => (window as unknown as { __videoSeconds: number }).__videoSeconds,
    });
    const real = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() {
        return real?.get?.call(this) ?? "";
      },
      set(this: HTMLMediaElement, value: string) {
        if (value) setTimeout(() => this.dispatchEvent(new Event("loadedmetadata")), 0);
      },
    });
  }, seconds);
}

async function openCopy(page: Page, request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/v1/projects", {
    data: { name: `Upload copy ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, copyFromDemo: true },
  });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { project: { id: string } }).project.id;
  await page.goto(`/projects/${id}`);
  await expect(line(page, 1)).toBeVisible();
  return id;
}

test("a 200-second video is refused with the limit message before anything is sent", async ({ page, request }) => {
  await stubVideoLength(page, 200);
  await openCopy(page, request);
  let asked = false;
  page.on("request", (r) => {
    if (r.url().includes("/upload-url")) asked = true;
  });
  await expect(upload(page)).toContainText("Limits: one English video, up to 180 seconds, and a plain-text script.");
  await upload(page).getByLabel("Choose a video file").setInputFiles(fakeVideo("long-take.mp4"));
  await expect(upload(page).getByRole("alert")).toHaveText(
    "This video is 200 seconds long. The limit is 180 seconds. Trim it and try again.",
  );
  expect(asked).toBe(false);
});

test("a failed upload keeps the script and checklist and Try again finishes it", async ({ page, request }) => {
  await stubVideoLength(page, 52);
  await openCopy(page, request);

  // Unsaved work the user has already entered.
  const field = page.getByLabel("Script text. Each sentence becomes one numbered line.");
  const draft = `${await field.inputValue()} One more line I am still writing.`;
  await field.fill(draft);
  await page.getByLabel("New item").fill("Show the payment screen");
  await page.getByRole("button", { name: "Add item" }).click();

  await page.route("**/assets/upload-url", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "storage_unavailable", message: "Storage is not answering." } }),
    }),
  );
  await upload(page).getByLabel("Choose a video file").setInputFiles(fakeVideo("take-2.mp4"));
  const alert = upload(page).getByRole("alert");
  await expect(alert).toContainText("Asking the server for an upload address failed.");
  await expect(alert).toContainText("Storage is not answering.");

  // Nothing the user entered was lost.
  await expect(field).toHaveValue(draft);
  await expect(page.getByRole("list", { name: "Checklist items" })).toContainText("Show the payment screen");

  await page.unroute("**/assets/upload-url");
  const created = page.waitForResponse((r) => r.url().includes("/upload-url") && r.request().method() === "POST");
  await upload(page).getByRole("button", { name: "Try again" }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { assetVersion: { durationMs: number; storagePath: string } };
  expect(body.assetVersion.durationMs).toBe(52_000);
  expect(body.assetVersion.storagePath).toContain("take-2.mp4");

  await expect(upload(page)).toContainText("Video version 2 saved.");
  await expect(upload(page)).toContainText("Fixture mode has no storage, so the file was not sent anywhere.");
  await expect(field).toHaveValue(draft);
  // A new video version makes the old evidence out of date, as the server reports it.
  await expect(line(page, 2)).toContainText("Poltergeist (Evidence out of date)");
});

test("the demo has no file picker", async ({ page }) => {
  await page.goto("/projects/proofpay-demo");
  await expect(line(page, 1)).toBeVisible();
  await expect(upload(page)).toContainText("The demo is read-only. Make an editable copy to upload a video.");
  await expect(upload(page).getByLabel("Choose a video file")).toHaveCount(0);
});
