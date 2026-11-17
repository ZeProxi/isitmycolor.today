"use client";

import { useEffect, useRef } from "react";

/**
 * A bird or two crossing the sky above the footer's mountains now and then. One flies over every
 * quarter to three-quarters of a minute, sometimes with a companion just behind, in either direction.
 * Nothing flies for people who ask for reduced motion, or while the tab is in the background.
 */
const WINGS_UP = "M0 1.2Q4.2 0 8 5 11.8 0 16 1.2 11.6 2.6 8 7.4 4.4 2.6 0 1.2z";
const WINGS_DOWN = "M0 6.4Q4 2.2 8 3.2 12 2.2 16 6.4 12 4.4 8 5.8 4 4.4 0 6.4z";

export function RidgeBirds({ className }: { className: string }) {
  const first = useRef<HTMLSpanElement>(null);
  const second = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const birds = [first.current, second.current].filter((b): b is HTMLSpanElement => !!b);
    const box = birds[0]?.parentElement;
    if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer = 0;
    const running: { anim: Animation; bob: Animation; flap: number }[] = [];

    const fly = (bird: HTMLSpanElement, dir: number, y: number, duration: number, delay: number) => {
      const w = box.clientWidth;
      const from = dir > 0 ? -24 : w + 24;
      const to = dir > 0 ? w + 24 : -24;
      const svg = bird.firstElementChild as SVGSVGElement;
      const [up, down] = Array.from(svg.children) as SVGPathElement[];
      bird.style.top = `${y}px`;
      bird.style.visibility = "visible";
      // straight across at a steady pace, with a slow rise and fall on top
      const anim = bird.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration, delay, fill: "both", easing: "linear" });
      const bob = svg.animate([{ transform: "translateY(-4px)" }, { transform: "translateY(4px)" }], { duration: 2600 + Math.random() * 1200, direction: "alternate", iterations: Infinity, easing: "ease-in-out" });
      let wingsUp = true;
      const flap = window.setInterval(() => {
        wingsUp = !wingsUp;
        up.style.display = wingsUp ? "" : "none";
        down.style.display = wingsUp ? "none" : "";
      }, 230);
      const entry = { anim, bob, flap };
      running.push(entry);
      anim.onfinish = () => {
        bird.style.visibility = "hidden";
        bob.cancel();
        clearInterval(flap);
        running.splice(running.indexOf(entry), 1);
      };
    };

    let inView = true; // no flights while the mountains are scrolled out of view
    const watch = new IntersectionObserver(([e]) => (inView = e.isIntersecting));
    watch.observe(box);

    const schedule = (wait: number) => {
      timer = window.setTimeout(() => {
        // only on the screen size being shown, only while someone is looking, and never two flocks at once
        if (box.offsetParent !== null && inView && !document.hidden && running.length === 0) {
          const h = box.clientHeight;
          const dir = Math.random() < 0.5 ? 1 : -1;
          const y = -0.15 * h + Math.random() * 0.4 * h; // in the sky: from just above the peaks to among them
          const duration = (box.clientWidth / (26 + Math.random() * 14)) * 1000; // 26 to 40 pixels a second
          fly(birds[0], dir, y, duration, 0);
          if (birds[1] && Math.random() < 0.55) fly(birds[1], dir, y + 5 + Math.random() * 6, duration, 700 + Math.random() * 600);
        }
        schedule(15000 + Math.random() * 30000);
      }, wait);
    };
    schedule(3000 + Math.random() * 5000);

    return () => {
      clearTimeout(timer);
      watch.disconnect();
      for (const r of running) {
        r.anim.cancel();
        r.bob.cancel();
        clearInterval(r.flap);
      }
    };
  }, []);

  const bird = (ref: React.RefObject<HTMLSpanElement | null>) => (
    <span ref={ref} className="pointer-events-none absolute left-0" style={{ visibility: "hidden" }}>
      <svg className={`block ${className}`} viewBox="0 0 16 8" fill="#7d7d74">
        <path d={WINGS_UP} />
        <path d={WINGS_DOWN} style={{ display: "none" }} />
      </svg>
    </span>
  );
  return (
    <>
      {bird(first)}
      {bird(second)}
    </>
  );
}
