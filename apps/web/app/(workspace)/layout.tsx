import type { ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { GuestAuthProvider } from "@/components/guest-auth-provider";
import { clientAuthConfigFromEnv } from "@/lib/auth-config";

/**
 * Midnight Screening Room shell.
 * Wraps every page in the (workspace) route group with a site header and a
 * skip-navigation link. The decorative fog layer lives in the root layout so
 * it spans the full viewport; this layout only adds navigation chrome.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Read the data mode when the request arrives, not at build time, so the browser always
  // signs in the way the running server expects. Only public values reach the browser.
  await connection();
  const authConfig = clientAuthConfigFromEnv();
  return (
    <GuestAuthProvider config={authConfig}>
      {/* Skip link: keyboard users jump past the nav to the main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-foreground"
      >
        Skip to main content
      </a>

      <header className="border-b border-line bg-surface/80 backdrop-blur-sm print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          {/* Site wordmark */}
          <Link
            href="/"
            className="font-display text-2xl text-primary-strong tracking-tight hover:text-primary transition-colors"
            aria-label="SLEUTH home"
          >
            SLEUTH
          </Link>

          {/* Primary navigation */}
          <nav aria-label="Site navigation">
            <ul className="flex items-center gap-6 text-sm text-muted" role="list">
              <li>
                <Link
                  href="/"
                  className="hover:text-foreground transition-colors focus-visible:text-foreground"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="outline-none">
        {children}
      </main>
    </GuestAuthProvider>
  );
}
