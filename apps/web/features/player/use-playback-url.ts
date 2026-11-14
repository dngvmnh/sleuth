"use client";

import { useEffect, useRef, useState } from "react";

export interface PlaybackAnswer {
  url: string | null;
  expiresAt: string | null;
}

/** Ask again this long before the URL expires. */
export const REFRESH_MARGIN_MS = 30_000;
/** Never ask more often than this, even when the expiry is close or in the past. */
export const MIN_REFRESH_MS = 5_000;

/**
 * The playable URL of one asset version, or `null` when nothing plays (the demo, fixture mode, a
 * file that never reached storage, or a failed request). The URL lives only in this hook's state:
 * it is asked for again before `expiresAt` and never stored anywhere else.
 */
export function usePlaybackUrl(
  fetchPlaybackUrl: (assetVersionId: string) => Promise<PlaybackAnswer>,
  assetVersionId: string | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const latest = useRef(fetchPlaybackUrl);
  useEffect(() => {
    latest.current = fetchPlaybackUrl;
  });

  useEffect(() => {
    if (!assetVersionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = () => {
      latest
        .current(assetVersionId)
        .then((answer) => {
          if (cancelled) return;
          setUrl(answer.url);
          if (answer.url && answer.expiresAt) {
            const wait = Math.max(MIN_REFRESH_MS, Date.parse(answer.expiresAt) - Date.now() - REFRESH_MARGIN_MS);
            timer = setTimeout(ask, wait);
          }
        })
        .catch(() => {
          // A failed check means "no playable video": the simulated clock stays available.
          if (!cancelled) setUrl(null);
        });
    };
    ask();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [assetVersionId]);

  return assetVersionId ? url : null;
}