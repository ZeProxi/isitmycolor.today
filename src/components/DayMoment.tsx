"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A moment of animation the first time a signed-in person opens the site each
 * day: a banner drops over the screen with the news, holds for a beat, and
 * lifts. When one of their colors is listed it is in that color, with a frowning
 * face. When none is, it is amber with a smiling face, and confetti goes off over it. Purely decorative: it never blocks a tap, is skipped for
 * people who ask for reduced motion, and the server decides whether today's has
 * already been shown (once per account). On the day it is due it arrives as part of
 * the page, so the page is never seen first; afterwards, a listed color's tile shakes.
 *
 * Adding ?moment=clear or ?moment=mine to the address plays it on demand; ?moment=clear-load and
 * ?moment=mine-load play it the way it runs on the day, driven by the stylesheet.
 */
export function DayMoment({ kind, pending = false, hex, ink = "#fff", label = "", clearLabel = "" }: { kind: "clear" | "mine"; pending?: boolean; hex: string; ink?: string; label?: string; clearLabel?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const curtain = useRef<HTMLDivElement>(null);
  const icon = useRef<SVGSVGElement>(null);
  // `pending` comes from the server: today's banner hasn't been shown yet. Then the banner is part of the page
  // as it arrives and drops by plain CSS, before any script has run, so the page is never seen first.
  // `scripted` is the other way in: the ?moment= preview, where the script drops the banner on request.
  const [which, setWhich] = useState<"clear" | "mine" | null>(pending ? kind : null);
  const [scripted, setScripted] = useState(false);

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(() => alive && fn(), ms));
    const stop = () => {
      alive = false;
      timers.forEach(clearTimeout);
    };

    if (still) {
      later(0, () => setWhich(null)); // the stylesheet already keeps the banner hidden; nothing is marked as seen
      return stop;
    }
    const forced = new URLSearchParams(location.search).get("moment");
    if (forced === "clear" || forced === "mine") {
      later(0, () => {
        setScripted(true);
        setWhich(forced);
      });
      return stop;
    }
    if (forced === "clear-load" || forced === "mine-load") {
      // a preview of the real thing: the stylesheet-driven banner, with the colors held back underneath
      const section = document.querySelector("[data-mine-today]")?.closest("section") ?? document.querySelector("main section");
      section?.classList.add("moment-hold");
      later(0, () => setWhich(forced === "clear-load" ? "clear" : "mine"));
      later(CLEAR_MS + 600, () => section?.classList.remove("moment-hold"));
      return stop;
    }
    if (pending) {
      // It is on screen now: mark today's as seen. If another device got there first, take it down quietly.
      fetch("/api/me/moment", { method: "POST" })
        .then((r) => (r.ok ? r.json() : { play: true }))
        .then((d) => alive && !d.play && setWhich(null))
        .catch(() => {});
    } else if (kind === "mine") {
      later(1100, shakeMine); // no banner today, but your color is up: the tile gives a short shake once it has landed
    }
    return stop;
  }, [kind, pending]);

  // While it is up: the face moves, good news gets confetti, and it is taken away once it has lifted.
  useEffect(() => {
    if (!which || !curtain.current) return;
    const total = which === "clear" ? CLEAR_MS : MINE_MS;
    const down = DROP_MS / total; // the drop and the lift take the same time whichever banner it is
    const drop = scripted
      ? curtain.current.animate(
          [
            { transform: "translateY(-100%)", offset: 0 },
            { transform: "translateY(0)", offset: down, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
            { transform: "translateY(0)", offset: 1 - down * 1.2, easing: "cubic-bezier(0.6, 0, 0.8, 0.2)" },
            { transform: "translateY(-100%)", offset: 1 },
          ],
          { duration: total, fill: "both" },
        )
      : null; // otherwise the stylesheet below is already doing exactly this
    const move = icon.current?.animate(
      which === "mine"
        ? // the frowning face shakes its head, then settles
          [0, -14, 12, -10, 8, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` }))
        : // the smiling face pops in
          [{ transform: "scale(0.4)", opacity: 0 }, { transform: "scale(1.15)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }],
      { duration: which === "mine" ? 900 : 520, delay: 380, easing: "ease-in-out", fill: "backwards" },
    );
    const stopConfetti = which === "clear" && canvas.current ? play(canvas.current, CLEAR_MS + 400) : () => {};
    const done = setTimeout(
      () => {
        setWhich(null);
        // it has lifted and your color is there underneath: the tile gives a short shake
        if (which === "mine") setTimeout(shakeMine, 200);
      },
      total + (which === "clear" ? 500 : 0), // let the last confetti fade
    );
    return () => {
      drop?.cancel();
      move?.cancel();
      stopConfetti();
      clearTimeout(done);
    };
  }, [which, scripted]);

  if (!which) return null;
  const mine = which === "mine";
  const total = mine ? MINE_MS : CLEAR_MS;
  const down = (DROP_MS / total) * 100;
  // The banner's whole life as a stylesheet, for the day it arrives with the page: drop, hold, lift. It needs no
  // script, so it can't be late and it can't get stuck. While it drops, the colors underneath are kept out of
  // sight (`.moment-hold` is on the section around them), so the first thing seen is the banner, then the page.
  const css = `
@keyframes moment-curtain{0%{transform:translateY(-100%);animation-timing-function:cubic-bezier(.2,.9,.3,1)}${down.toFixed(2)}%{transform:translateY(0)}${(100 - down * 1.2).toFixed(2)}%{transform:translateY(0);animation-timing-function:cubic-bezier(.6,0,.8,.2)}100%{transform:translateY(-100%)}}
@keyframes moment-reveal{from{visibility:hidden}to{visibility:visible}}
.moment-curtain{animation:moment-curtain ${total}ms both}
.moment-hold{animation:moment-reveal 0s linear ${DROP_MS}ms both}
@media (prefers-reduced-motion:reduce){.moment-curtain{display:none}.moment-hold{animation:none}}`;
  return (
    <>
      {!scripted && <style>{css}</style>}
      <div
        ref={curtain}
        aria-hidden
        className={`pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 px-6 text-center ${scripted ? "" : "moment-curtain"}`}
        style={{ background: mine ? hex : "#edb058", color: mine ? ink : "#131313", visibility: "visible", ...(scripted ? { transform: "translateY(-100%)" } : {}) }}
      >
        <svg ref={icon} className="h-32 w-32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {/* a face reads faster than the words: frowning on your day, smiling when it isn't */}
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9.5v1M15 9.5v1" strokeWidth="2" />
          {mine ? <path d="M8.2 16.2c1-1.5 2.3-2.2 3.8-2.2s2.8.7 3.8 2.2" /> : <path d="M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4" />}
        </svg>
        <p className="display text-5xl font-bold leading-none sm:text-7xl">{mine ? label : clearLabel}</p>
      </div>
      {!mine && <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[61] h-full w-full" style={{ visibility: "visible" }} />}
    </>
  );
}

/** Your color's tile (or tiles) on today's list gives a short, quick shake, like a phone buzzing on a table. */
function shakeMine() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const tile of document.querySelectorAll<HTMLElement>("[data-mine-today]")) {
    tile.animate(
      [0, -5, 5, -5, 4, -4, 3, -2, 2, -1, 0].map((x, i) => ({ transform: `translateX(${x}px) rotate(${i % 2 ? -0.6 : 0.6}deg)` })).concat([{ transform: "none" }]),
      { duration: 650, easing: "linear" },
    );
  }
}

/** How long the banner takes to drop (and, a little longer, to lift). */
const DROP_MS = 420;

/** How long each banner is on screen. Good news stays a little longer, with confetti to watch. */
const MINE_MS = 3000;
const CLEAR_MS = 3600;

const CONFETTI = ["#131313", "#f1f1ee", "#2f6fd0", "#1f9d57", "#e5484d", "#8e4ec6"];

type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; spin: number; color: string };

/** Throws confetti on the canvas and returns a function that stops it early. */
function play(canvas: HTMLCanvasElement, DURATION: number): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const count = Math.round(Math.min(160, Math.max(70, W / 6)));
  // thrown up from the two bottom corners, then it flutters down
  const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
    const left = i % 2 === 0;
    return {
      x: left ? rnd(-10, W * 0.15) : rnd(W * 0.85, W + 10),
      y: H + rnd(0, 20),
      vx: (left ? 1 : -1) * rnd(2, 9),
      vy: -rnd(H / 55, H / 32),
      w: rnd(6, 11),
      h: rnd(8, 16),
      rot: rnd(0, Math.PI * 2),
      spin: rnd(-0.25, 0.25),
      color: CONFETTI[i % CONFETTI.length],
    };
  });

  const t0 = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.max(0, Math.min(1, (DURATION - t) / 600)); // fade out over the last 600 ms
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.32; // gravity
      p.vx *= 0.99;
      p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      const flip = Math.cos(p.rot * 2); // pieces flip as they fall
      ctx.fillRect(-p.w / 2, (-p.h / 2) * flip, p.w, p.h * flip);
      ctx.restore();
    }
    if (t < DURATION) frame = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, W, H);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    ctx.clearRect(0, 0, W, H);
  };
}
