"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { FINDING_LABELS, type FindingType } from "@sleuth/contracts";
import { FINDING_ICONS, LockIcon } from "@/components/icons";
import { PanelCorners } from "@/components/ornaments";
import styles from "./dashboard.module.css";
import { FINDING_GUIDE, FINDING_ORDER, TAG_TEXT, type FindingTag } from "./finding-guide";

const TAG_STYLE: Record<FindingTag, string> = {
  blocks: "border-solid border-danger text-danger",
  person: "border-dashed border-warn text-warn",
  outside: "border-dotted border-spectral text-spectral",
};

export function FindingTagChip({ tag }: { tag: FindingTag }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-xs ${TAG_STYLE[tag]}`}>
      {tag === "blocks" ? <LockIcon size={12} /> : null}
      {TAG_TEXT[tag]}
    </span>
  );
}

/**
 * "A cabinet of findings": one card per finding type, picked like radio buttons (arrow keys
 * move and choose, Home and End jump), with the chosen type explained in the panel beside.
 */
export function FindingsCabinet() {
  const [chosen, setChosen] = useState<FindingType>(FINDING_ORDER[0] as FindingType);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const detailId = useId();

  const choose = (index: number) => {
    const count = FINDING_ORDER.length;
    const next = ((index % count) + count) % count;
    setChosen(FINDING_ORDER[next] as FindingType);
    cards.current[next]?.focus();
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: FINDING_ORDER.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    choose(target);
  };

  const label = FINDING_LABELS[chosen];
  const guide = FINDING_GUIDE[chosen];
  const ChosenIcon = FINDING_ICONS[chosen];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div
        role="radiogroup"
        aria-label="Finding types"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        data-testid="findings-cabinet"
      >
        {FINDING_ORDER.map((type, index) => {
          const l = FINDING_LABELS[type];
          const Icon = FINDING_ICONS[type];
          const checked = type === chosen;
          return (
            <button
              key={type}
              ref={(el) => {
                cards.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-controls={detailId}
              tabIndex={checked ? 0 : -1}
              onClick={() => choose(index)}
              onKeyDown={(e) => onKey(e, index)}
              data-finding-type={type}
              className={`panel panel-lift flex min-h-36 flex-col items-start gap-2 p-4 text-left ${
                checked ? "border-line-strong bg-raised" : ""
              } ${type === "cursed_frame" ? styles.cursed : ""}`}
            >
              <PanelCorners />
              <Icon size={36} className={checked ? "text-primary" : "text-gold"} />
              <span className={`font-display text-xl text-foreground ${type === "cursed_frame" ? styles.cursedName : ""}`}>
                {l.spooky}
              </span>
              <span className="text-sm text-muted">({l.plain})</span>
              <span className="mt-auto">
                <FindingTagChip tag={FINDING_GUIDE[type].tag} />
              </span>
            </button>
          );
        })}
      </div>

      <section
        id={detailId}
        aria-live="polite"
        aria-labelledby={`${detailId}-title`}
        className="panel self-start p-5 lg:sticky lg:top-6"
        data-testid="cabinet-detail"
      >
        <PanelCorners />
        <ChosenIcon size={48} className="text-primary" />
        <h3 id={`${detailId}-title`} className="mt-3 font-display text-2xl text-foreground">
          {label.spooky}
          <span className="block font-sans text-sm text-muted">{label.plain}</span>
        </h3>
        <p className="mt-3 text-sm text-foreground">{label.meaning}</p>
        <h4 className="mt-4 text-xs font-semibold uppercase tracking-widest text-spectral">How it is found</h4>
        <p className="mt-1 text-sm text-muted">{guide.found}</p>
        <h4 className="mt-4 text-xs font-semibold uppercase tracking-widest text-spectral">How to clear it</h4>
        <p className="mt-1 text-sm text-muted">{guide.clear}</p>
        <p className="mt-4">
          <FindingTagChip tag={guide.tag} />
        </p>
      </section>
    </div>
  );
}
