"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./dashboard.module.css";

/** A cycle of 20 to 40 s, so the bat crosses at an irregular pace. */
export function batCycleSeconds(random: () => number = Math.random): number {
  return 20 + Math.round(random() * 20);
}

/** The first crossing waits 2 to 8 s, so it never starts the moment the page opens. */
export function batFirstDelaySeconds(random: () => number = Math.random): number {
  return 2 + Math.round(random() * 6);
}

/** Fixed star positions [x, y, r], so the sky is the same on every render (no random markup). */
const STARS: [number, number, number][] = [
  [24, 30, 1.1], [58, 74, 0.8], [92, 22, 1.3], [131, 58, 0.7], [160, 18, 0.9], [196, 84, 1.1],
  [222, 40, 0.7], [254, 16, 1.2], [276, 70, 0.8], [302, 34, 0.9], [420, 26, 1.1], [446, 72, 0.8],
  [468, 118, 1], [436, 160, 0.7], [18, 132, 0.9], [74, 150, 0.7], [118, 108, 1], [186, 138, 0.8],
  [240, 112, 0.7], [312, 104, 0.9], [404, 196, 0.8], [40, 206, 0.7],
];

function Tree({ x, y = 300, scale = 1, flip = false }: { x: number; y?: number; scale?: number; flip?: boolean }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}
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

/** A small dark tree for the front row: a trunk and a few bare branches, filled like a silhouette. */
function FrontTree({ x, scale = 1, flip = false }: { x: number; scale?: number; flip?: boolean }) {
  return (
    <g
      transform={`translate(${x} 392) scale(${flip ? -scale : scale} ${scale})`}
      className="stroke-background"
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
    >
      <path d="M0 0V-58" strokeWidth={5} />
      <path d="M0-24-18-40-22-56M0-36 16-52 18-66M16-52 28-56M0-50-8-66" />
    </g>
  );
}

/**
 * The dashboard hero picture: an old cinema house on a hill at night. From the back: stars,
 * a crescent moon, three hill layers, bare trees, the house with two lit windows and a film
 * reel for the rose window, a mist band at the foot of the hill, and a dark front row of trees.
 * Original drawing, decorative only, drawn with token classes so it follows the theme.
 * The bat crosses the moon once per cycle; it is gone under reduced motion.
 */
export function HeroArt({ className = "" }: { className?: string }) {
  const bat = useRef<SVGGElement>(null);
  // Keep only characters that are safe inside `url(#...)`.
  const id = `hero${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    if (!bat.current) return;
    bat.current.style.animationDuration = `${batCycleSeconds()}s`;
    bat.current.style.animationDelay = `${batFirstDelaySeconds()}s`;
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
        <filter id={`${id}-soft`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={`${id}-mist`} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* Stars: still, small, faint. */}
      <g className="fill-foreground" data-layer="stars">
        {STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} opacity={r > 1 ? 0.7 : 0.4} />
        ))}
      </g>

      {/* Moon: a gold crescent with a faint halo. */}
      <circle cx="362" cy="92" r="58" className="fill-gold/10" filter={`url(#${id}-soft)`} />
      <circle cx="362" cy="92" r="42" className="fill-gold/85" mask={`url(#${id}-moon)`} />

      {/* Three hill layers, the nearest fading into the page at the bottom. */}
      <g mask={`url(#${id}-ground)`} data-layer="hills">
        <path d="M0 262C60 232 120 236 170 250S270 222 330 236 430 230 480 244V400H0Z" className="fill-line/25" />
        <path d="M0 300C70 262 140 258 210 276S360 250 480 268V400H0Z" className="fill-line/50" />
        <path d="M0 330C90 290 170 278 250 286S390 300 480 318V400H0Z" className="fill-raised" />
      </g>

      {/* Bare trees behind and beside the house. */}
      <Tree x={92} scale={1.15} />
      <Tree x={128} scale={0.8} flip />
      <Tree x={404} scale={1} flip />
      <Tree x={444} y={312} scale={0.6} />

      {/* Soft light behind the two lit windows. */}
      <circle cx="293" cy="139" r="16" className="fill-primary/35" filter={`url(#${id}-soft)`} />
      <circle cx="298" cy="225" r="18" className="fill-primary/30" filter={`url(#${id}-soft)`} />

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
        {/* Dark window. */}
        <rect x="186" y="214" width="16" height="22" className="fill-background" />
      </g>
      {/* The lit windows: the tower and the right ground-floor window. */}
      <rect x="288" y="132" width="10" height="14" className={`fill-primary ${styles.window}`} />
      <rect x="290" y="214" width="16" height="22" className={`fill-primary/90 ${styles.window}`} />
      <path d="M298 214V236M290 225H306" className="stroke-surface" strokeWidth={1.5} />

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

      {/* Mist at the foot of the hill. */}
      <g className={styles.groundMist} filter={`url(#${id}-mist)`} data-layer="mist">
        <ellipse cx="150" cy="306" rx="170" ry="10" className="fill-foreground/10" />
        <ellipse cx="350" cy="318" rx="180" ry="12" className="fill-spectral/10" />
      </g>

      {/* Front row of dark trees, kept clear of the door. */}
      <g data-layer="front-trees">
        <FrontTree x={22} scale={1.1} />
        <FrontTree x={58} scale={0.75} flip />
        <FrontTree x={150} scale={0.6} />
        <FrontTree x={352} scale={0.65} flip />
        <FrontTree x={440} scale={1.15} flip />
        <path d="M0 392C40 380 80 384 120 390S200 386 230 392H0ZM262 392C300 384 360 382 400 388S460 382 480 386V392Z" className="fill-background" />
      </g>

      {/* The bat, crossing the moon. */}
      <g ref={bat} className={`fill-background ${styles.bat}`} data-layer="bat">
        <path d="M0 0C5-8 11-9 15-4 16-8 19-8 20-4 24-9 30-8 35 0 29-3 25 0 22 4 20 1 15 1 12 4 10 0 6-3 0 0Z" />
      </g>
    </svg>
  );
}
