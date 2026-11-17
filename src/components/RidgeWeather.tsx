"use client";

import { useEffect, useRef } from "react";

/**
 * Real weather for the footer's mountains: whatever it is doing in Utah Valley, it does here.
 * Rain falls, snow drifts down, storms flicker, fog settles in the valley, and clouds cover the sun.
 * On a clear day nothing is drawn and the footer looks the way it always has.
 *
 * It draws on one canvas laid over the mountains and the strip of sky above them, and tells the rest of the
 * scene how much sun is left through `--sunlight` (the lit peaks) and the `[data-sun]` element (the sun and
 * its glow). `?weather=rain|snow|storm|fog|cloudy|partly|clear` (add `-heavy` for more) previews any of them.
 * People who ask for reduced motion get the clouds and the dimmed sun, with nothing falling.
 */
type Kind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";
type Weather = { kind: Kind; heavy: boolean };
const KINDS: Kind[] = ["clear", "partly", "cloudy", "fog", "rain", "snow", "storm"];

/** How much of the sun gets through. */
const SUNLIGHT: Record<Kind, number> = { clear: 1, partly: 0.8, cloudy: 0.45, fog: 0.45, rain: 0.25, snow: 0.3, storm: 0.12 };

// All three screen sizes of the footer share one lookup.
let lookup: Promise<Weather> | null = null;
function currentWeather(): Promise<Weather> {
  const preview = new URLSearchParams(location.search).get("weather");
  if (preview) {
    const kind = preview.replace("-heavy", "") as Kind;
    if (KINDS.includes(kind)) return Promise.resolve({ kind, heavy: preview.endsWith("-heavy") });
  }
  lookup ??= fetch("/api/weather")
    .then((r) => r.json())
    .then((w) => (KINDS.includes(w?.kind) ? { kind: w.kind as Kind, heavy: !!w.heavy } : { kind: "clear" as Kind, heavy: false }))
    .catch(() => ({ kind: "clear" as Kind, heavy: false }));
  return lookup;
}

export function RidgeWeather() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stop = () => {};
    let gone = false;

    void currentWeather().then(({ kind, heavy }) => {
      if (gone || kind === "clear") return;
      const g = canvas.getContext("2d");
      if (!g) return;

      // less sun on the peaks, and on the sun itself
      box.style.setProperty("--sunlight", String(SUNLIGHT[kind]));
      const sun = box.querySelector<HTMLElement>("[data-sun]");
      if (sun) sun.style.opacity = String(SUNLIGHT[kind]);
      canvas.style.display = "block";

      let w = 0;
      let h = 0;
      const size = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        w = canvas.clientWidth;
        h = canvas.clientHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        // No hard edges: the weather thins out to nothing over the foothills, so by the line where the footer's
        // text begins there is none left, and it fades in at the top of the sky the same way.
        const ground = Math.round(box.clientHeight * 0.36);
        const mask = `linear-gradient(to bottom, transparent, #000 24px, #000 calc(100% - ${ground}px), transparent calc(100% - 3px))`;
        canvas.style.maskImage = mask;
        canvas.style.setProperty("-webkit-mask-image", mask);
      };
      size();

      // Where the sun is on the canvas, so clouds near it can catch its light.
      const sunDisc = sun?.lastElementChild as HTMLElement | null;
      const sunAt = () => {
        const c = canvas.getBoundingClientRect();
        const r = sunDisc?.getBoundingClientRect();
        return r && r.width ? { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top } : null;
      };

      // Clouds: one deck across the sky in two rows, a paler row behind and a darker one in front, each cloud
      // a flat-bottomed heap of circles. They overlap into a ceiling when it is overcast and thin out to a few
      // when it is only partly cloudy. Everything that falls, falls from their base.
      const cover = kind === "fog" ? 0 : kind === "partly" ? 0.3 : kind === "cloudy" ? 0.6 : 1.25;
      // Everything is sized to the mountains: on a phone they are less than half as tall as on a desktop, so the
      // clouds are smaller and sit lower, just above the peaks, instead of towering over the page.
      const k = Math.min(1, Math.max(0.42, box.clientHeight / 128));
      const BASE = Math.round(96 - 26 * k); // the height of the cloud base, in pixels from the top of the canvas
      const row = (n: number, y: number, back: boolean) =>
        Array.from({ length: n }, (_, i) => ({
          x: ((i + Math.random() * 0.7) / n) * (w + 240) - 120,
          y: y + Math.random() * 10 * k,
          s: ((back ? 0.75 : 0.95) + Math.random() * 0.5) * k,
          v: (back ? 1.6 : 3) + Math.random() * 1.6, // pixels per second; the nearer row is quicker
          back,
        }));
      const perRow = Math.round((w / (95 * k)) * cover);
      const clouds = cover ? [...row(Math.max(1, perRow), BASE - 22 * k, true), ...row(Math.max(2, perRow), BASE - 8 * k, false)] : [];
      const tone = kind === "storm" ? ["#262628", "#1c1c1e"] : kind === "partly" ? ["#333332", "#2a2a29"] : ["#2e2e2d", "#232323"];
      const drawCloud = (x: number, y: number, s: number) => {
        g.beginPath();
        for (const [dx, dy, r] of [[-30, 0, 15], [-12, -9, 19], [10, -12, 22], [31, -3, 16], [48, 2, 11]]) {
          g.moveTo(x + dx * s + r * s, y + dy * s);
          g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
        }
        g.rect(x - 38 * s, y, 92 * s, 12 * s);
        g.fill();
      };

      // What falls. Rain is fast streaks on a slant; snow is slow dots that sway.
      const falling = kind === "rain" || kind === "storm" || kind === "snow";
      const snow = kind === "snow";
      const amount = (snow ? w / 7 : w / 4.5) * (heavy || kind === "storm" ? 1.7 : 1);
      const drops = falling && !still
        ? Array.from({ length: Math.round(amount) }, () => ({
            x: Math.random() * (w + 60) - 30,
            y: BASE + Math.random() * Math.max(1, h - BASE),
            v: snow ? 16 + Math.random() * 26 : 300 + Math.random() * 190,
            size: (snow ? 0.7 + Math.random() * 1.2 : 7 + Math.random() * 8) * (0.55 + 0.45 * k),
            phase: Math.random() * 6.28,
          }))
        : [];

      // Lightning: a forked bolt from the base of a cloud down toward the range, lit twice in quick succession,
      // with the sky and the clouds brightening for the same instant. Faint and rare: weather, not a strobe.
      type Bolt = { at: number; main: [number, number][]; fork: [number, number][] };
      let bolt: Bolt | null = null;
      let nextBolt = performance.now() + 3500 + Math.random() * 5000;
      const strike = (now: number): Bolt => {
        const from = clouds.filter((c) => !c.back && c.x > 30 && c.x < w - 30);
        const c = from[Math.floor(Math.random() * from.length)];
        let x = c ? c.x : w * (0.2 + Math.random() * 0.6);
        let y = BASE + 2;
        const end = BASE + (h - BASE) * (0.35 + Math.random() * 0.3);
        const lean = (Math.random() - 0.5) * 5;
        const main: [number, number][] = [[x, y]];
        while (y < end) {
          y += 5 + Math.random() * 7;
          x += lean + (Math.random() - 0.5) * 13;
          main.push([x, y]);
        }
        const fork: [number, number][] = [];
        if (main.length > 4) {
          let [fx, fy] = main[Math.floor(main.length * (0.3 + Math.random() * 0.3))];
          const side = Math.random() < 0.5 ? -1 : 1;
          fork.push([fx, fy]);
          for (let i = 0; i < 3 + Math.random() * 3; i++) {
            fx += side * (4 + Math.random() * 7);
            fy += 4 + Math.random() * 6;
            fork.push([fx, fy]);
          }
        }
        return { at: now, main, fork };
      };
      const trace = (pts: [number, number][]) => {
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      };

      let inView = true;
      const watch = new IntersectionObserver(([e]) => (inView = e.isIntersecting), { rootMargin: "100px" });
      watch.observe(box);
      const onResize = () => size();
      window.addEventListener("resize", onResize);

      let last = performance.now();
      let raf = 0;
      const frame = (now: number) => {
        if (!still) raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (box.offsetParent === null || !inView) return; // not the screen size being shown, or out of view
        if (canvas.clientWidth !== w) size();
        g.clearRect(0, 0, w, h);

        // how bright the lightning is right now: full, a gap, then a weaker second pulse that fades
        let lit = 0;
        if (kind === "storm" && !still) {
          if (now > nextBolt && clouds.length) {
            bolt = strike(now);
            nextBolt = now + 6000 + Math.random() * 10000;
          }
          if (bolt) {
            const t = now - bolt.at;
            lit = t < 80 ? 1 : t < 140 ? 0 : t < 330 ? 0.7 * (1 - (t - 140) / 190) : 0;
            if (t > 330) bolt = null;
          }
        }

        // the cloud deck
        for (const c of clouds) {
          c.x += c.v * dt;
          if (c.x > w + 120) c.x = -120;
        }
        for (const back of [true, false]) {
          g.fillStyle = tone[back ? 0 : 1];
          for (const c of clouds) if (c.back === back) drawCloud(c.x, c.y, c.s);
        }
        if (clouds.length) {
          // light on the clouds, painted only where there is cloud: the low sun warms the ones near it,
          // and lightning whitens the whole deck for an instant
          g.globalCompositeOperation = "source-atop";
          const at = sunAt();
          if (at) {
            const warm = g.createRadialGradient(at.x, at.y, 0, at.x, at.y, 190);
            const k = 0.25 + 0.3 * SUNLIGHT[kind];
            warm.addColorStop(0, `rgba(237, 176, 88, ${k})`);
            warm.addColorStop(0.5, `rgba(237, 176, 88, ${k * 0.35})`);
            warm.addColorStop(1, "rgba(237, 176, 88, 0)");
            g.fillStyle = warm;
            g.fillRect(0, 0, w, h);
          }
          if (lit) {
            g.fillStyle = `rgba(214, 224, 255, ${0.3 * lit})`;
            g.fillRect(0, 0, w, h);
          }
          g.globalCompositeOperation = "source-over";
        }

        if (lit && bolt) {
          // the sky and the land brighten a touch, then the bolt itself
          g.fillStyle = `rgba(210, 220, 255, ${0.07 * lit})`;
          g.fillRect(0, 0, w, h);
          g.lineJoin = "round";
          g.shadowColor = "rgba(190, 205, 255, 0.9)";
          g.shadowBlur = 9;
          g.strokeStyle = `rgba(240, 244, 255, ${0.95 * lit})`;
          g.lineWidth = 1.6;
          trace(bolt.main);
          g.lineWidth = 0.9;
          if (bolt.fork.length) trace(bolt.fork);
          g.shadowBlur = 0;
        }

        if (kind === "fog") {
          // a soft bank lying over the valley, thickest along the foot of the range
          const bank = g.createLinearGradient(0, h * 0.5, 0, h);
          bank.addColorStop(0, "rgba(190, 190, 184, 0)");
          bank.addColorStop(0.55, `rgba(190, 190, 184, ${heavy ? 0.26 : 0.17})`);
          bank.addColorStop(1, "rgba(190, 190, 184, 0.05)");
          g.fillStyle = bank;
          g.fillRect(0, 0, w, h);
        }

        // Rain and snow are painted behind what is already there, so they come out from under the clouds
        // and never streak across the front of them. (Drawn in reverse: the drops, then the veil behind those.)
        g.globalCompositeOperation = "destination-over";
        if (drops.length) {
          // everything starts at the cloud base and fades in just below it
          const fade = g.createLinearGradient(0, BASE - 6, 0, BASE + 22 * k);
          const ink = snow ? "236, 236, 230" : "172, 192, 214";
          fade.addColorStop(0, `rgba(${ink}, 0)`);
          fade.addColorStop(1, `rgba(${ink}, ${snow ? 0.85 : 0.36 + 0.25 * lit})`);
          if (snow) {
            g.fillStyle = fade;
            g.beginPath();
            for (const d of drops) {
              d.y += d.v * dt;
              d.x += Math.sin(now / 900 + d.phase) * 9 * dt;
              if (d.y > h) {
                d.y = BASE - 4;
                d.x = Math.random() * (w + 60) - 30;
              }
              g.moveTo(d.x + d.size, d.y);
              g.arc(d.x, d.y, d.size, 0, Math.PI * 2);
            }
            g.fill();
          } else {
            g.strokeStyle = fade;
            g.lineWidth = 1;
            g.beginPath();
            for (const d of drops) {
              d.y += d.v * dt;
              d.x -= d.v * 0.16 * dt;
              if (d.y > h) {
                d.y = BASE - 4 + Math.random() * 10;
                d.x = Math.random() * (w + 60);
              }
              g.moveTo(d.x, d.y);
              g.lineTo(d.x + d.size * 0.16, d.y - d.size);
            }
            g.stroke();
          }
        }
        if (falling) {
          // a thin veil under the clouds, so the air itself looks wet (or white), not just the streaks
          const veil = g.createLinearGradient(0, BASE, 0, h);
          const tint = snow ? "225, 225, 220" : "150, 172, 196";
          veil.addColorStop(0, `rgba(${tint}, 0)`);
          veil.addColorStop(0.4, `rgba(${tint}, ${snow ? 0.05 : 0.07})`);
          veil.addColorStop(1, `rgba(${tint}, ${snow ? 0.07 : 0.04})`);
          g.fillStyle = veil;
          g.fillRect(0, BASE, w, h - BASE);
        }
        g.globalCompositeOperation = "source-over";
      };
      raf = requestAnimationFrame(frame);

      stop = () => {
        cancelAnimationFrame(raf);
        watch.disconnect();
        window.removeEventListener("resize", onResize);
        box.style.removeProperty("--sunlight");
        if (sun) sun.style.opacity = "";
      };
    });

    return () => {
      gone = true;
      stop();
    };
  }, []);

  // covers the mountains and the same strip of sky above them that the sun's glow uses
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 hidden h-[calc(100%+6rem)] w-full" />;
}
