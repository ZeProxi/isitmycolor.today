"use client";

import { useEffect, useRef } from "react";

/**
 * The resident of the footer's woods. He ambles back and forth along the foothills, stopping now and then,
 * and bolts the other way if the pointer (or a tap) comes near him. Keep bothering him and he loses his
 * patience: he jumps, turns around and chases the pointer. If he catches it he takes it: the real cursor
 * disappears, he runs off holding it, and gives it back a few seconds later (or at once if the mouse
 * leaves the mountains, so nobody is ever left without a cursor).
 *
 * He lives in the same 1200 x 160 drawing space as the mountains (see Ridge.tsx): `from` and `to` are the
 * slice of it this screen size shows, and his feet follow the same ground line the foothills were drawn
 * with. People who ask for reduced motion get him standing still.
 */
const STRIDE = "M12.4 3.4 14.9 0.5 17 3.2zM9.2 8.4 12 6.6 16.6 7.2 18.2 10 17.8 15.6 16.6 20 10.2 20.6 8.4 15.4 8.2 11zM16.4 8.6 18.6 9.4 21.6 14.6 22.8 21.6 20.9 22.4 19.4 16.6 16.4 12.2zM9.8 8.8 8 9.4 4.8 14.4 2.6 21.2 4.5 22 6.9 16.2 10.2 12.2zM12.6 19.6 16.9 19.6 19.6 24 20.3 29.4 23.5 30.4 23.5 31.8 17.9 31.8 17.3 25.6 13.4 22.6zM10.2 20 13.8 20.6 11.8 25.6 7.8 28.6 5.4 31.8 2.6 31.2 4.6 27.2 8.6 24.4zM11.4 4.9a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0z";
const PASSING = "M12.4 3.4 14.9 0.5 17 3.2zM9.2 8.4 12 6.6 16.6 7.2 18.2 10 17.8 15.6 16.6 20 10.2 20.6 8.4 15.4 8.2 11zM16.4 8.6 18.6 9.4 19.8 15 19.4 22 17.4 22 17.4 16 16 12.2zM9.8 8.8 8 9.4 7 15 7.8 22 9.8 22 9.4 16 10.4 12.2zM12.8 19.6 16.9 19.6 16.6 25 16.4 30 19.6 30.6 19.6 31.8 13.6 31.8 13.4 25zM9.8 20 13.4 20.4 12.8 25.6 12.6 30 13.4 31.8 8.4 31.8 9.2 25.6zM11.4 4.9a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0z";

/** The top of the foothills at x, in drawing units from the top. Must match the curve the foothills were generated with. */
const ground = (x: number) => 128 - 9 * Math.sin(x / 83 + 0.6) - 5 * Math.sin(x / 31);

const WALK = 16; // pixels per second: in no hurry
const RUN = 190; // pixels per second: very much in a hurry
const SCARE = 95; // how close, in pixels, the pointer gets before he runs
const SAFE = 220; // how far away he gets before he calms down
const PATIENCE = 12; // how many times he can be pestered in quick succession before he has had enough
const FORGET = 4000; // milliseconds of being left alone after which he forgets all of it
const TANTRUM = 6500; // milliseconds he spends chasing the pointer once he has
const HOP = 420; // milliseconds a jump lasts
const HEIST = 3800; // milliseconds he keeps the cursor once he has it

export function RidgeWalker({ from, to, start, className }: { from: number; to: number; start: number; className: string }) {
  const el = useRef<SVGSVGElement>(null);
  const stride = useRef<SVGPathElement>(null);
  const passing = useRef<SVGPathElement>(null);
  const loot = useRef<SVGSVGElement>(null); // the cursor, while he has it

  useEffect(() => {
    const node = el.current;
    const box = node?.parentElement;
    if (!node || !box) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let x = start; // where he is, in drawing units
    let target = start;
    let facing = 1; // 1 = right, -1 = left
    let pauseUntil = performance.now() + 1500 + Math.random() * 2500;
    let fleeing = false;
    let startled = 0; // how many times lately; fades if he is left alone
    let lastStartle = 0;
    let lastSide = 0; // which side of him the pointer was on when last close: 1 = to his left, -1 = to his right
    let angryUntil = 0; // while now < this, he is the one doing the chasing
    let hopAt = -1e9; // when his current (or last) jump began
    let stolenUntil = 0; // while now < this, he is carrying the cursor
    let mouse = false; // the last pointer was a real mouse (there is no cursor to take on a touch screen)
    let hide: HTMLStyleElement | null = null; // the rule that hides the real cursor while he has it
    let pointerX: number | null = null; // pointer position in pixels from the box's left edge, when it is near the ridge
    let last = performance.now();
    let stepAt = 0;
    let frameA = false;
    let raf = 0;

    const place = (moving: boolean, now: number) => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      const left = ((x - from) / (to - from)) * w;
      const bottom = ((160 - ground(x)) / 160) * h - 1;
      // a small bob with each step while he is moving
      const bob = moving ? Math.abs(Math.sin(now / (fleeing ? 55 : 150))) * (fleeing ? 2 : 1) : 0;
      // a jump is one arc, up and back down, about three-quarters of his own height
      const t = (now - hopAt) / HOP;
      const hop = t >= 0 && t <= 1 ? Math.sin(Math.PI * t) * node.clientHeight * 0.75 : 0;
      node.style.left = `${left}px`;
      node.style.bottom = `${bottom + bob + hop}px`;
      if (loot.current) {
        // held up in his leading hand
        loot.current.style.display = stolenUntil ? "" : "none";
        loot.current.style.left = `${left + facing * node.clientWidth * 0.5}px`;
        loot.current.style.bottom = `${bottom + bob + hop + node.clientHeight * 0.5}px`;
      }
      node.style.transform = `translateX(-50%) scaleX(${facing})`;
    };
    const pose = (a: boolean) => {
      frameA = a;
      if (stride.current) stride.current.style.display = a ? "" : "none";
      if (passing.current) passing.current.style.display = a ? "none" : "";
    };

    pose(false);
    place(false, last);
    if (still) return;

    const margin = (to - from) * 0.02; // the border: he stops just inside the edge of the screen
    const pickTarget = () => from + margin + Math.random() * (to - from - 2 * margin);

    const onPointer = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      // only when the pointer is on the mountains themselves, not the page above or the footer links below
      pointerX = e.clientY > r.top - 24 && e.clientY < r.bottom ? e.clientX - r.left : null;
      mouse = e.pointerType === "mouse";
    };
    const giveBack = () => {
      hide?.remove();
      hide = null;
      stolenUntil = 0;
    };
    const onLeave = () => (pointerX = null);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    // nothing happens while the mountains are scrolled out of view
    let inView = true;
    const watch = new IntersectionObserver(([e]) => (inView = e.isIntersecting), { rootMargin: "120px" });
    watch.observe(box);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (box.offsetParent === null || !inView) {
        if (hide) giveBack(); // resized or scrolled away mid-heist: hand the cursor back
        return; // this screen size isn't the one being shown
      }
      const w = box.clientWidth || 1;
      const perPx = (to - from) / w; // drawing units per pixel
      const px = ((x - from) / (to - from)) * w;

      const gap = pointerX === null ? Infinity : px - pointerX;
      let angry = false;

      if (stolenUntil) {
        if (now > stolenUntil || pointerX === null) {
          // he has had his fun (or the mouse went elsewhere): the cursor comes back and all is forgiven
          giveBack();
          angryUntil = 0;
          startled = 0;
          fleeing = false;
          target = x;
          pauseUntil = now + 1800 + Math.random() * 1500;
        } else {
          fleeing = true; // still making his getaway
        }
      } else {
        angry = now < angryUntil && pointerX !== null;
        if (!angry && angryUntil) {
          // tantrum over (time's up, or the pointer left): back to minding his own business
          angryUntil = 0;
          startled = 0;
          fleeing = false;
          target = x;
          pauseUntil = now + 1500 + Math.random() * 1500;
        }

        if (angry) {
          // the tables turn: he runs at the pointer
          fleeing = true; // same speed and quick step as when he runs away
          target = Math.min(to - margin, Math.max(from + margin, from + (pointerX as number) * perPx));
          if (Math.abs(gap) < 16) {
            if (mouse && !hide) {
              // got it. The real cursor vanishes, and he is off to whichever end is further away.
              hide = document.createElement("style");
              hide.textContent = "*,*::before,*::after{cursor:none!important}";
              document.head.appendChild(hide);
              stolenUntil = now + HEIST;
              hopAt = now; // a little leap as he grabs it
              target = x - from > (to - from) / 2 ? from + margin : to - margin;
            } else if (now - hopAt > HOP + 180) {
              hopAt = now; // nothing to take on a touch screen, so he just jumps at it
            }
          }
        } else if (Math.abs(gap) < SCARE) {
          // Which side of him the pointer is on. Sweeping it back and forth across him is pestering too,
          // so every crossing counts, the same as scaring him afresh.
          const side = gap >= 0 ? 1 : -1;
          const crossed = lastSide !== 0 && side !== lastSide;
          lastSide = side;
          if (!fleeing || crossed) {
            // startled (or pestered): count it. Left alone for a while, he forgets.
            if (now - lastStartle > FORGET) startled = 0;
            startled++;
            lastStartle = now;
            if (startled >= PATIENCE) {
              angryUntil = now + TANTRUM;
              hopAt = now; // the jump that says "that's it"
            }
          }
          fleeing = true;
          // away from the pointer, as far as the edge of the screen; cornered there, he stops and stands
          const dir = gap >= 0 ? 1 : -1;
          facing = dir;
          target = dir > 0 ? to - margin : from + margin;
        } else if (fleeing && Math.abs(gap) > SAFE) {
          fleeing = false;
          target = x;
          pauseUntil = now + 900 + Math.random() * 1500; // catches his breath
        }
      }
      const busy = angry || stolenUntil > 0; // not the moment to wander off somewhere

      let moving = false;
      if (fleeing || now >= pauseUntil) {
        const speed = (fleeing ? RUN : WALK) * perPx;
        const d = target - x;
        if (Math.abs(d) <= speed * dt) {
          x = target;
          if (!busy && Math.abs(gap) >= SCARE) {
            if (fleeing) fleeing = false;
            pauseUntil = now + 1200 + Math.random() * 4000; // has a look around
            target = pickTarget();
          }
        } else {
          facing = d > 0 ? 1 : -1;
          x += facing * speed * dt;
          moving = true;
        }
      }
      // two poses alternate while he moves; standing uses the upright one
      if (moving) {
        if (now - stepAt > (fleeing ? 85 : 280)) {
          stepAt = now;
          pose(!frameA);
        }
      } else if (frameA) pose(false);
      place(moving, now);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      watch.disconnect();
      giveBack(); // never leave the page without its cursor
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [from, to, start]);

  return (
    <>
      <svg ref={el} className={`absolute ${className}`} viewBox="0 0 24 32" fill="var(--ink-2)" style={{ left: "50%", bottom: "23%", transform: "translateX(-50%)" }}>
        <path ref={stride} d={STRIDE} style={{ display: "none" }} />
        <path ref={passing} d={PASSING} />
      </svg>
      {/* an ordinary arrow cursor, shown in his hand while the real one is hidden */}
      <svg ref={loot} className="absolute h-[15px] w-[11px] -translate-x-1/2" viewBox="0 0 12 17" style={{ display: "none" }}>
        <path d="M1 1v12.5l3.3-3.1 2.2 5.1 2-.9-2.2-5H11z" fill="#fff" stroke="#111" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    </>
  );
}
