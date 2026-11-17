"use client";

import { useEffect, useRef } from "react";

/**
 * Now and then an airliner crosses the sky behind the mountains: a small silhouette with a blinking light
 * and a long trail behind it, disappearing behind the taller peaks as it goes. One every minute or two.
 * It sits behind the ranges in the page, so it must come before the drawing among its siblings.
 * Nothing flies for people who ask for reduced motion, or while the footer is out of view.
 */
export function RidgePlane({ className }: { className: string }) {
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const plane = el.current;
    const box = plane?.parentElement;
    if (!plane || !box || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const body = plane.firstElementChild as HTMLElement;
    const light = plane.querySelector<SVGCircleElement>("circle");

    let timer = 0;
    let flight: Animation | null = null;
    const blink = light?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.12 }, { opacity: 0, offset: 0.13 }, { opacity: 0 }], { duration: 1300, iterations: Infinity });
    blink?.pause();

    let inView = true;
    const watch = new IntersectionObserver(([e]) => (inView = e.isIntersecting));
    watch.observe(box);

    const schedule = (wait: number) => {
      timer = window.setTimeout(() => {
        if (box.offsetParent !== null && inView && !document.hidden && !flight) {
          const w = box.clientWidth;
          const h = box.clientHeight;
          const dir = Math.random() < 0.5 ? 1 : -1;
          const from = dir > 0 ? -260 : w + 260; // far enough off-screen that the whole trail follows it out
          const to = dir > 0 ? w + 260 : -260;
          const y = -0.12 * h + Math.random() * 0.4 * h; // from above the peaks to behind the taller ones
          const climb = (Math.random() - 0.5) * 0.14 * h; // a gentle climb or descent on the way across
          body.style.transform = `scaleX(${dir})`; // drawn facing right
          plane.style.top = `${y}px`;
          plane.style.visibility = "visible";
          blink?.play();
          flight = plane.animate([{ transform: `translate(${from}px, 0)` }, { transform: `translate(${to}px, ${climb}px)` }], {
            duration: ((w + 520) / (42 + Math.random() * 16)) * 1000, // 42 to 58 pixels a second
            easing: "linear",
            fill: "both",
          });
          flight.onfinish = () => {
            plane.style.visibility = "hidden";
            blink?.pause();
            flight = null;
          };
        }
        schedule(60000 + Math.random() * 90000);
      }, wait);
    };
    schedule(20000 + Math.random() * 30000);

    return () => {
      clearTimeout(timer);
      watch.disconnect();
      flight?.cancel();
      blink?.cancel();
    };
  }, []);

  return (
    <span ref={el} className="pointer-events-none absolute left-0" style={{ visibility: "hidden" }}>
      <span className="flex items-center">
        {/* the trail it leaves across the sky: tight and bright behind the tail, spreading and fading with distance */}
        <span
          className="mr-0.5 block h-[3px] w-56"
          style={{
            background: "linear-gradient(90deg, transparent, rgb(190 190 184 / 0.16) 35%, rgb(200 200 194 / 0.5))",
            clipPath: "polygon(0 0, 100% 35%, 100% 65%, 0 100%)",
            filter: "blur(0.4px)",
          }}
        />
        <svg className={`block ${className}`} viewBox="0 0 24 8">
          <g fill="#75756e">
            <path d="M1 4.2Q1 3.4 3 3.3L18 3.2Q22 3.4 23 4.4 22 5.2 18 5.2L3 5.1Q1 5 1 4.2z" />
            <path d="M2 3.4 1 .6h2.4L6 3.3z" />
            <path d="M10 4.6 7 7.6h2.4L14.5 4.6z" />
          </g>
          <circle cx="11" cy="5.6" r="0.9" fill="#ff5a4d" />
        </svg>
      </span>
    </span>
  );
}
