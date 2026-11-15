"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const isAppleDevice = () =>
  /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Directions links that hand off to the native app when it's installed:
 * - google.com/maps/dir is a universal link: the Google Maps app opens it on
 *   Android and iOS; elsewhere it's the web route planner.
 * - maps.apple.com always opens Apple Maps on iPhone/iPad/Mac, so that button
 *   only appears on Apple devices.
 */
export function DirectionsButtons({
  destination,
  googleLabel,
  appleLabel,
}: {
  destination: string;
  googleLabel: string;
  appleLabel: string;
}) {
  // false during server render and hydration, then the real answer on the client
  const apple = useSyncExternalStore(noop, isAppleDevice, () => false);

  const q = encodeURIComponent(destination);
  const google = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
  const appleUrl = `https://maps.apple.com/?daddr=${q}&dirflg=d`;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <a className="btn-ghost px-4 py-1.5 text-sm" href={google} target="_blank" rel="noreferrer">
        <PinIcon />
        {googleLabel}
      </a>
      {apple && (
        <a className="btn-ghost px-4 py-1.5 text-sm" href={appleUrl} target="_blank" rel="noreferrer">
          <PinIcon />
          {appleLabel}
        </a>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}
