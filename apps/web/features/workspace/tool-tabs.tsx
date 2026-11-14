"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface ToolTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern, automatic activation): Left and Right move between
 * tabs and open them, Home and End jump, Tab moves into the open panel. Every panel stays
 * mounted and only hidden, so a draft in one tab survives a visit to another.
 * The open tab gets the amber underline; it slides in, and is still under reduced motion.
 */
export function ToolTabs({ label, tabs, initial }: { label: string; tabs: ToolTab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();

  const open = (index: number) => {
    const count = tabs.length;
    const next = ((index % count) + count) % count;
    setActive(tabs[next]?.id);
    buttons.current[next]?.focus();
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    open(target);
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line">
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => open(index)}
              onKeyDown={(e) => onKey(e, index)}
              className={`relative min-h-10 px-1 py-2 text-sm transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-left after:bg-primary after:transition-transform motion-reduce:after:transition-none ${
                selected
                  ? "font-semibold text-foreground after:scale-x-100 forced-colors:after:bg-[Highlight]"
                  : "text-muted after:scale-x-0 hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="pt-4 focus-visible:outline-offset-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
