import { describe, expect, it } from "vitest";
// Importing prod-screenshots.ts opens no browser: it runs only when called as a script.
import { fileName, parseProjectArg, siteOf, VIEWPORTS } from "./prod-screenshots";

describe("prod-screenshots", () => {
  it("shoots at 1440x900 and 375x812", () => {
    expect(VIEWPORTS.map((v) => `${v.width}x${v.height}`)).toEqual(["1440x900", "375x812"]);
  });

  it("accepts only a plain project id after --project", () => {
    expect(parseProjectArg([])).toBeNull();
    expect(parseProjectArg(["--project", "prj-0mwg38n3s0001-2988bc56"])).toBe("prj-0mwg38n3s0001-2988bc56");
    expect(parseProjectArg(["--project"])).toBe("invalid");
    expect(parseProjectArg(["--project", "../../etc"])).toBe("invalid");
    expect(parseProjectArg(["--project", "a b"])).toBe("invalid");
  });

  it("uses the live site by default and refuses anything but https", () => {
    expect(siteOf({})).toBe("https://sleuth-eight.vercel.app");
    expect(siteOf({ PROD_SITE_URL: "https://example.vercel.app/" })).toBe("https://example.vercel.app");
    expect(siteOf({ PROD_SITE_URL: "http://localhost:3000" })).toBeNull();
    expect(siteOf({ PROD_SITE_URL: "https://x.app/path?token=1" })).toBeNull();
  });

  it("names files by shot and size under docs/submission/screenshots/production", () => {
    expect(fileName("dashboard-hero", "mobile").replace(/\\/g, "/")).toBe(
      "docs/submission/screenshots/production/dashboard-hero-mobile.png",
    );
  });
});
