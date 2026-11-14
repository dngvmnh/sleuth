"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { KeyIcon } from "@/components/icons";
import { NightWindToggle } from "@/features/ambience/night-wind-toggle";
import { IdentityChip } from "./identity-chip";
import { OpenFindingsChip } from "./open-findings-chip";
import { useSaveStatus } from "./save-status";

/** The project id in `/projects/{id}` or `/projects/{id}/report`, if the page is inside one. */
export function projectIdOf(pathname: string): string | undefined {
  const match = /^\/projects\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1] as string) : undefined;
}

interface NavItem {
  label: string;
  href: string;
  current: boolean;
}

export function navItems(pathname: string): NavItem[] {
  const projectId = projectIdOf(pathname);
  const items: NavItem[] = [
    { label: "Dashboard", href: "/", current: pathname === "/" },
    { label: "Findings guide", href: "/#findings-guide", current: false },
  ];
  if (projectId) {
    const href = `/projects/${encodeURIComponent(projectId)}/report`;
    items.push({ label: "Report", href, current: pathname === href || pathname.endsWith("/report") });
  }
  return items;
}

/** Site header: wordmark, navigation, and the open-findings, Night wind and reviewer chips. */
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const { savedCount, reset } = useSaveStatus();
  // A new page starts with no save to report.
  useEffect(() => {
    reset();
  }, [pathname, reset]);
  const refreshKey = `${pathname}#${savedCount}`;

  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur-sm print:hidden">
      <div className="mx-auto grid max-w-6xl gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <div className="flex flex-col gap-0.5">
          <Link
            href="/"
            aria-label="SLEUTH home"
            className="inline-flex w-fit items-center gap-2 font-display text-2xl tracking-tight text-primary-strong transition-colors hover:text-primary"
          >
            <KeyIcon size={20} className="text-gold" />
            SLEUTH
          </Link>
          <p className="eyebrow" aria-hidden="true">
            The haunted cut
          </p>
        </div>

        <nav aria-label="Site navigation" className="lg:justify-self-center">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted" role="list">
            {navItems(pathname).map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={`nav-link transition-colors hover:text-foreground focus-visible:text-foreground ${
                    item.current ? "text-foreground" : ""
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-wrap items-center gap-2 lg:justify-self-end">
          <OpenFindingsChip refreshKey={refreshKey} />
          <NightWindToggle />
          <IdentityChip refreshKey={pathname} />
        </div>
      </div>
    </header>
  );
}
