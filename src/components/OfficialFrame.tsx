"use client";

import { useEffect, useRef, useState } from "react";

const FRAME_W = 900; // render the hotline page at a desktop width, then scale to fit
const FRAME_H = 720;

/**
 * The live hotline page, display-only. The frame can't receive clicks or
 * keystrokes and the sandbox blocks forms and scripts, so its text boxes can't
 * be typed into. On narrow screens the frame is scaled down so the whole page
 * stays visible without needing to scroll inside it.
 */
export function OfficialFrame({ url, openLabel, reloadLabel }: { url: string; openLabel: string; reloadLabel: string }) {
  const [nonce, setNonce] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / FRAME_W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a className="btn-primary text-sm" href={url} target="_blank" rel="noreferrer">
          {openLabel}
        </a>
        <button type="button" className="btn-ghost text-sm" onClick={() => setNonce((n) => n + 1)}>
          {reloadLabel}
        </button>
      </div>
      <div ref={box} className="glass overflow-hidden rounded-3xl bg-white" style={{ height: FRAME_H * scale }}>
        <iframe
          key={nonce}
          src={url}
          title="wasatch.org/colors"
          className="pointer-events-none select-none"
          style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }}
          sandbox=""
          referrerPolicy="no-referrer"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
