import type { ReactNode } from "react";
import { connection } from "next/server";
import { GuestAuthProvider } from "@/components/guest-auth-provider";
import { SaveStatusProvider } from "@/components/shell/save-status";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { clientAuthConfigFromEnv } from "@/lib/auth-config";

/**
 * The haunted-house shell (brief 007).
 * Wraps every page in the (workspace) route group with a skip link, the site header, the
 * footer and the save-status context the editors report into. The decorative fog, grain and
 * vignette live in the root layout so they span the full viewport.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Read the data mode when the request arrives, not at build time, so the browser always
  // signs in the way the running server expects. Only public values reach the browser.
  await connection();
  const authConfig = clientAuthConfigFromEnv();
  return (
    <GuestAuthProvider config={authConfig}>
      <SaveStatusProvider>
        {/* Skip link: keyboard users jump past the nav to the main content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-foreground"
        >
          Skip to main content
        </a>

        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          {/* At least one screen tall, so the footer never jumps when the page's data arrives (layout shift). */}
          <main id="main-content" tabIndex={-1} className="min-h-svh flex-1 outline-none">
            {children}
          </main>
          <SiteFooter />
        </div>
      </SaveStatusProvider>
    </GuestAuthProvider>
  );
}
