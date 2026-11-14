"use client";

import { useEffect, useRef } from "react";

// Atmosphere layers (brief 007). All are decorative: `aria-hidden`, `pointer-events: none`,
// hidden in print and in forced colours. The CSS lives in styles/globals.css.
// Grain and vignette are static, so they stay under reduced motion; mist and the lantern
// light move, so they are switched off there.

/** Film grain over the whole page: one static noise tile at about 5% opacity. */
export function Grain() {
  return <div className="sleuth-grain" aria-hidden="true" />;
}

/** Darker page edges. Static. */
export function Vignette() {
  return <div className="sleuth-vignette" aria-hidden="true" />;
}

/**
 * Low mist along the bottom of a hero section: two blurred strips drifting slowly in opposite
 * directions (70 s and 90 s loops). The hero needs `position: relative` and `overflow: hidden`.
 */
export function GroundMist() {
  return (
    <div className="sleuth-mist" aria-hidden="true">
      <span className="sleuth-mist-strip sleuth-mist-a" />
      <span className="sleuth-mist-strip sleuth-mist-b" />
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A soft amber light (280 px) that follows the pointer inside its parent, for hero sections
 * only. It listens on the parent element and writes two CSS variables at most once a frame.
 * Touch pointers and reduced motion never light it. The parent needs `position: relative`.
 */
export function LanternCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const host = layer?.parentElement;
    if (!layer || !host || prefersReducedMotion()) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      layer.style.setProperty("--lantern-x", `${x}px`);
      layer.style.setProperty("--lantern-y", `${y}px`);
      layer.dataset.lit = "true";
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = host.getBoundingClientRect();
      x = event.clientX - box.left;
      y = event.clientY - box.top;
      if (frame === 0) frame = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      delete layer.dataset.lit;
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="sleuth-lantern" aria-hidden="true" />;
}
