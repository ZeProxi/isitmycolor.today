"use client";

import { useEffect, useRef } from "react";

/**
 * Depth and weather for the footer's mountains. It renders nothing itself; it moves its siblings:
 *
 * - Anything marked `data-depth="N"` slides up to N pixels sideways, against the pointer, so the distant
 *   range moves more than the main range and the foothills not at all: flat layers read as real distance.
 *   `data-rise="N"` starts the layer N pixels low and brings it up into place as the footer scrolls into
 *   view (the sun comes up as you reach the bottom of the page).
 * - Anything marked `data-haze="S"` drifts across the range from left to right, taking S seconds.
 *
 * None of it runs for people who ask for reduced motion.
 */
export function RidgeMotion() {
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = el.current?.parentElement;
    if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layers = Array.from(box.querySelectorAll<HTMLElement | SVGElement>("[data-depth]")).map((node) => ({
      node,
      depth: Number(node.dataset.depth) || 0,
      rise: Number(node.dataset.rise) || 0,
    }));

    const drifts = Array.from(box.querySelectorAll<HTMLElement>("[data-haze]")).map((node) => {
      const duration = (Number(node.dataset.haze) || 90) * 1000;
      return node.animate([{ left: "-50%" }, { left: "100%" }], { duration, iterations: Infinity, delay: -Math.random() * duration, easing: "linear" });
    });

    let want = 0; // where the pointer is across the window, -1 (left edge) to 1 (right edge)
    let have = 0; // the same, eased, so the layers glide instead of snapping
    let raf = 0;
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "mouse") want = (e.clientX / window.innerWidth) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // nothing moves while the mountains are scrolled out of view
    let inView = true;
    const watch = new IntersectionObserver(
      ([e]) => {
        inView = e.isIntersecting;
        for (const d of drifts) {
          if (inView) d.play();
          else d.pause();
        }
      },
      { rootMargin: "200px" },
    );
    watch.observe(box);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (box.offsetParent === null || !inView) return; // not the screen size being shown, or out of view
      have += (want - have) * 0.06;
      const r = box.getBoundingClientRect();
      // 0 when the mountains are just below the screen, 1 once they are well into view
      const seen = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (r.height + 140)));
      for (const l of layers) {
        l.node.style.transform = `translate(${(-have * l.depth).toFixed(2)}px, ${((1 - seen) * l.rise).toFixed(2)}px)`;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      watch.disconnect();
      window.removeEventListener("pointermove", onPointer);
      for (const d of drifts) d.cancel();
      for (const l of layers) l.node.style.transform = "";
    };
  }, []);

  return <span ref={el} hidden />;
}
