"use client";

import { useRef } from "react";

/**
 * The real video. `url` is a short-lived signed URL: when a fresh one arrives the element loads it
 * and goes back to where it was, so asking again for a URL never throws the viewer to 0:00.
 * The browser's own controls stay on, so the keyboard works without our code.
 */
export function PlaybackVideo({
  url,
  onElement,
}: {
  url: string;
  onElement: (el: HTMLVideoElement | null) => void;
}) {
  const lastSeconds = useRef(0);
  return (
    <video
      ref={onElement}
      src={url}
      controls
      preload="metadata"
      aria-label="Project video"
      className="w-full rounded-md border border-line-strong bg-background"
      onTimeUpdate={(e) => {
        if (e.currentTarget.currentTime > 0) lastSeconds.current = e.currentTarget.currentTime;
      }}
      onLoadedMetadata={(e) => {
        if (lastSeconds.current > 0 && e.currentTarget.currentTime === 0) {
          e.currentTarget.currentTime = lastSeconds.current;
        }
      }}
    />
  );
}