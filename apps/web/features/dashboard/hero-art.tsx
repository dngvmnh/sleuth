"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./dashboard.module.css";

/** A cycle of 20 to 40 s, so the bat crosses at an irregular pace. */
export function batCycleSeconds(random: () => number = Math.random): number {
  return 20 + Math.round(random() * 20);
}

function Tree({ x, scale = 1, flip = false }: { x: number; scale?: number; flip?: boolean }) {
  return (
    <g
      transform={`translate(${x} 300) scale(${flip ? -scale : scale} ${scale})`}
      className="stroke-line-strong"
      fill="none"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <path d="M0 0V-92" strokeWidth={4} />
      <path d="M0-38-26-62-34-88M-26-62-48-70M0-56 22-80 30-104M22-80 44-86M0-80-12-104M30-104 26-118" />
    </g>
  );
}

/**
 * The dashboard hero picture: an old cinema house on a hill at night, a crescent moon, bare
 * trees, one lit window, and a film reel for the rose window. Original drawing, decorative
 * only. Drawn with token classes, so it follows the theme, and hidden in forced colours by
 * its parent. The bat crosses the moon once per cycle; it is gone under reduced motion.
 */
export function HeroArt({ className = "" }: { className?: string }) {
  const bat = useRef<SVGGElement>(null);
  // Keep only characters that are safe inside `url(#...)`.
  const id = `hero${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    if (bat.current) bat.current.style.animationDuration = `${batCycleSeconds()}s`;
  }, []);

  return (
    <svg
      viewBox="0 0 480 400"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-testid="hero-art"
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        {/* Masks are black and white by definition; they carry no theme colour. */}
        <mask id={`${id}-moon`}>
          <circle cx="362" cy="92" r="42" fill="white" />
          <circle cx="380" cy="80" r="38" fill="black" />
        </mask>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="white" />
          <stop offset="1" stopColor="black" />
        </linearGradient>
        <mask id={`${id}-ground`}>
          <rect width="480" height="400" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>

      {/* Moon: a gold crescent. */}
      <circle cx="362" cy="92" r="42" className="fill-gold/85" mask={`url(#${id}-moon)`} />

      {/* Far hills, then the near hill, fading into the page at the bottom. */}
      <g mask={`url(#${id}-ground)`}>
        <path d="M0 300C70 262 140 258 210 276S360 250 480 268V400H0Z" className="fill-line/50" />
        <path d="M0 330C90 290 170 278 250 286S390 300 480 318V400H0Z" className="fill-raised" />
      </g>

      {/* The cinema house. */}
      <g className="stroke-line-strong" strokeWidth={1.5} strokeLinejoin="round">
        <path d="M172 292V196L246 142 320 196V292Z" className="fill-surface" />
        <path d="M160 200 246 134 332 200" fill="none" strokeWidth={2.5} />
        {/* Tower with a pointed cap. */}
        <path d="M282 168V120H304V184" className="fill-surface" />
        <path d="M278 122 293 96 308 122Z" className="fill-raised" />
        {/* Marquee band over the door. */}
        <rect x="204" y="244" width="84" height="12" className="fill-raised" />
        {/* Door. */}
        <path d="M232 292V270A14 14 0 0 1 260 270V292Z" className="fill-background" />
        {/* Dark windows. */}
        <rect x="186" y="214" width="16" height="22" className="fill-background" />
        <rect x="290" y="214" width="16" height="22" className="fill-background" />
        <rect x="288" y="132" width="10" height="14" className="fill-background" />
      </g>
      {/* The one lit window, in the tower. */}
      <rect x="288" y="132" width="10" height="14" className={`fill-primary ${styles.window}`} />

      {/* Rose window: a film reel, five holes round a hub. */}
      <g transform="translate(246 196)" className="stroke-gold" fill="none" strokeWidth={1.6}>
        <circle r="22" className="fill-background" />
        <circle r="4" />
        {[0, 72, 144, 216, 288].map((deg) => (
          <circle
            key={deg}
            r="5.5"
            cx={Math.round(Math.cos((deg * Math.PI) / 180) * 12 * 100) / 100}
            cy={Math.round(Math.sin((deg * Math.PI) / 180) * 12 * 100) / 100}
          />
        ))}
      </g>

      {/* Bare trees either side. */}
      <Tree x={92} scale={1.15} />
      <Tree x={128} scale={0.8} flip />
      <Tree x={404} scale={1} flip />

      {/* The bat, crossing near the moon. */}
      <g ref={bat} className={`fill-background ${styles.bat}`}>
        <path d="M0 0C4-6 9-7 12-3 13-6 15-6 16-3 19-7 24-6 28 0 23-2 20 0 18 3 16 1 12 1 10 3 8 0 5-2 0 0Z" />
      </g>
    </svg>
  );
}
