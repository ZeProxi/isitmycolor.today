"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Seconds in: the logo is fully drawn by 0.75 s and starts leaving at about 4.3 s. */
const HOLD_AT = 3;

const QUERY = "(prefers-reduced-motion: reduce)";
function subscribe(cb: () => void) {
  const m = matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/**
 * The header logo. Plays its short intro once per page load, then pauses on the
 * finished logo, before the clip's exit animation starts. Falls back to the still image when the
 * visitor prefers reduced motion or the browser won't autoplay.
 */
export function LogoMark() {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!reduced) ref.current?.play().catch(() => setFailed(true));
  }, [reduced]);

  if (reduced || failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/logo.webp" alt="" width={60} height={36} className="h-9 w-[60px] object-contain" />;
  }
  return (
    <video
      ref={ref}
      src="/brand/logo.mp4"
      width={60}
      height={36}
      className="h-9 w-[60px]"
      muted
      playsInline
      autoPlay
      preload="auto"
      aria-hidden
      onTimeUpdate={(e) => {
        if (e.currentTarget.currentTime >= HOLD_AT) e.currentTarget.pause();
      }}
      onError={() => setFailed(true)}
    />
  );
}
