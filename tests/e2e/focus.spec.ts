/// <reference lib="dom" />
import { expect as baseExpect, test, type Page } from "@playwright/test";

// See dashboard.spec.ts: the first visit in dev mode compiles the route, so allow time to appear.
const expect = baseExpect.configure({ timeout: 30_000 });

interface Ring {
  name: string;
  color: string;
  style: string;
  width: number;
  offset: number;
  focusVisible: boolean;
  focusToken: string;
  pageBg: string;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: string): number {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) throw new Error(`Unreadable colour: ${rgb}`);
  const [r, g, b] = m.slice(0, 3).map(Number);
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Tab to the control with this accessible name and read its ring at once, with no waiting. */
async function tabTo(page: Page, name: string): Promise<Ring> {
  // Other specs add projects (copies) to the same dev server, so the list can be long.
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    // Read in the same task as the key press: no wait, so a fade-in cannot hide a bad start colour.
    const ring = await page.evaluate((target) => {
      const el = document.activeElement as HTMLElement;
      const label = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
      if (label !== target) return null;
      const cs = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--sleuth-focus");
      document.body.append(probe);
      const focusToken = getComputedStyle(probe).color;
      probe.remove();
      return {
        name: label,
        color: cs.outlineColor,
        style: cs.outlineStyle,
        width: parseFloat(cs.outlineWidth),
        offset: parseFloat(cs.outlineOffset),
        focusVisible: el.matches(":focus-visible"),
        focusToken,
        pageBg: getComputedStyle(document.body).backgroundColor,
      };
    }, name);
    if (ring) return ring;
  }
  throw new Error(`Never focused "${name}" with Tab`);
}

for (const [label, viewport, reducedMotion] of [
  ["desktop", { width: 1280, height: 900 }, "no-preference"],
  ["mobile", { width: 390, height: 844 }, "no-preference"],
  ["desktop with reduced motion", { width: 1280, height: 900 }, "reduce"],
  ["mobile with reduced motion", { width: 390, height: 844 }, "reduce"],
] as const) {
  test.describe(label, () => {
    test.use({ viewport, reducedMotion });

    for (const control of ["Dashboard", "Create a project"]) {
      test(`shows a visible focus ring on "${control}" the moment it is focused`, async ({ page }) => {
        await page.goto("/");
        await expect(page.getByText("Public demo, read-only")).toBeVisible({ timeout: 30_000 });
        const ring = await tabTo(page, control);

        expect(ring.focusVisible).toBe(true);
        expect(ring.style).toBe("solid");
        expect(ring.width).toBeGreaterThanOrEqual(2);
        // The 2px gap keeps the ring off the button fill, so it reads on the page background.
        expect(ring.offset).toBeGreaterThanOrEqual(2);
        // At once, not after a fade: the colour is already the focus token.
        expect(ring.color).toBe(ring.focusToken);
        // WCAG 1.4.11: at least 3:1 against the page background.
        expect(contrast(ring.color, ring.pageBg)).toBeGreaterThanOrEqual(3);
      });
    }
  });
}
