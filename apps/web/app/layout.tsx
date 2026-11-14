import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Grain, Vignette } from "@/components/ornaments";
import "../styles/globals.css";

// Display serif, self-hosted (SIL Open Font License 1.1, see ./fonts/OFL-instrument-serif.txt).
// Latin subset only; the fallback serifs in tokens.css cover other characters.
const display = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--sleuth-font-display-file",
  display: "swap",
  // Size the fallback serif to match, so headings do not move when the font arrives (layout shift).
  adjustFontFallback: "Times New Roman",
  fallback: ["Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
});

export const metadata: Metadata = {
  title: "SLEUTH: QA for demo videos",
  description:
    "Check a demo video against its script and checklist. Every match is a candidate; only a person confirms it.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Theme (decision D-14): "hollow" is the launch look. Set "midnight" to roll back.
    <html lang="en" data-theme="hollow" className={display.variable}>
      <body className="min-h-screen antialiased">
        <div className="sleuth-fog" aria-hidden="true" />
        <Vignette />
        <div className="relative z-10">{children}</div>
        <Grain />
      </body>
    </html>
  );
}
