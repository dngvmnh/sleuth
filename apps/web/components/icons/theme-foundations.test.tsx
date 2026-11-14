import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FINDING_LABELS } from "@sleuth/contracts";
import * as icons from "./index";

const web = resolve(__dirname, "..", "..");
const css = readFileSync(join(web, "styles", "tokens.css"), "utf8");

// ---- theme tokens ----

/** `--sleuth-name: #hex;` pairs inside the first block that starts with `selector {`. */
function tokensOf(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--sleuth-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1] as string] = (m[2] as string).toLowerCase();
  }
  return out;
}

const hollow = tokensOf(":root");
// A theme block only overrides; anything it leaves out comes from :root.
const midnight = { ...hollow, ...tokensOf(':root[data-theme="midnight"]') };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground token, background token, WCAG minimum]. */
const PAIRS: [string, string, number][] = [
  ["text", "surface", 4.5],
  ["text-muted", "surface", 4.5],
  ["primary", "surface", 4.5],
  ["on-primary", "primary", 4.5],
  ["warn", "surface", 4.5],
  ["danger", "surface", 4.5],
  ["ok", "surface", 4.5],
  ["spectral", "surface", 4.5],
  ["gold", "surface", 4.5],
  ["border-strong", "surface", 3],
  ["focus", "bg", 3],
];

describe("contrast formula", () => {
  it("matches known WCAG ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});

describe.each([
  ["hollow", hollow],
  ["midnight", midnight],
])("theme %s", (_name, theme) => {
  it.each(PAIRS)("%s on %s is at least %d:1", (fg, bg, min) => {
    const a = theme[fg];
    const b = theme[bg];
    expect(a, `--sleuth-${fg} is set`).toMatch(/^#[0-9a-f]{6}$/);
    expect(b, `--sleuth-${bg} is set`).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(a as string, b as string)).toBeGreaterThanOrEqual(min);
  });
});

describe("theme switch", () => {
  it("defaults to hollow on <html> and keeps midnight as the fallback block", () => {
    const layout = readFileSync(join(web, "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(/data-theme="hollow"/);
    expect(css).toContain(':root[data-theme="midnight"] {');
    expect(hollow.bg).toBe("#0c140f");
  });

  it("maps every new token into Tailwind, so components use token classes", () => {
    const globals = readFileSync(join(web, "styles", "globals.css"), "utf8");
    for (const name of ["line-strong", "gold", "spectral", "focus"]) {
      expect(globals).toMatch(new RegExp(`--color-${name}:\\s*var\\(--sleuth-`));
    }
  });

  it("keeps the print block above both themes", () => {
    const globals = readFileSync(join(web, "styles", "globals.css"), "utf8");
    expect(globals).toMatch(/@media print \{[\s\S]*:root,\s*:root\[data-theme\] \{/);
  });

  it("finds no raw hex colour in components, features or pages", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
          if (/#[0-9a-fA-F]{6}\b|\[#[0-9a-fA-F]{3,8}\]/.test(readFileSync(path, "utf8")))
            offenders.push(path.slice(web.length));
        }
      }
    };
    for (const dir of ["components", "features", "app"]) walk(join(web, dir));
    expect(offenders).toEqual([]);
  });
});

// ---- fonts ----

describe("self-hosted fonts", () => {
  const dir = join(web, "app", "fonts");
  const files = readdirSync(dir);

  it("uses at most 3 font files and 120 KB in total, with the licence beside them", () => {
    const fonts = files.filter((f) => /\.(woff2?|ttf|otf)$/.test(f));
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.length).toBeLessThanOrEqual(3);
    const total = fonts.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
    expect(total).toBeLessThanOrEqual(120 * 1024);
    const licence = readFileSync(join(dir, "OFL-instrument-serif.txt"), "utf8");
    expect(licence).toContain("SIL Open Font License, Version 1.1");
  });
});

// ---- icons ----

const ICON_NAMES = [
  "GhostIcon",
  "PhantomDialogueIcon",
  "CursedFrameIcon",
  "PoltergeistIcon",
  "NeedsOutsideProofIcon",
  "LanternIcon",
  "FilmReelIcon",
  "WaxSealIcon",
  "PlayIcon",
  "PauseIcon",
  "LockIcon",
  "CheckIcon",
  "ArrowUpRightIcon",
  "ChevronIcon",
  "CloseIcon",
  "UploadIcon",
  "FileIcon",
  "KeyIcon",
  "CrescentWindIcon",
  "HoodedFigureIcon",
] as const;

describe("icons", () => {
  it.each(ICON_NAMES)("%s is decorative by default and drawn in currentColor", (name) => {
    const Comp = icons[name];
    const { container } = render(<Comp />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.querySelectorAll("path, circle, rect").length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it.each(ICON_NAMES)("%s takes an accessible name when given a title", (name) => {
    const Comp = icons[name];
    const { getByRole } = render(<Comp title="Example name" />);
    const img = getByRole("img", { name: "Example name" });
    expect(img.getAttribute("aria-hidden")).toBeNull();
  });

  it("has a mark for every finding type", () => {
    for (const type of Object.keys(FINDING_LABELS)) {
      expect(icons.FINDING_ICONS[type as keyof typeof icons.FINDING_ICONS]).toBeTypeOf("function");
    }
  });
});
