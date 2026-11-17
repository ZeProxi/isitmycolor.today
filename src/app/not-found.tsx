import { Suspense } from "react";
import Link from "next/link";
import { getLang } from "@/lib/lang-server";

/**
 * The page for an address that doesn't exist (and for pages that are deliberately hidden from the person
 * asking). Somebody large walked through here and out of the picture: a line of footprints leads from the
 * message off the right-hand edge of the screen. He can usually be found in the mountains at the bottom.
 */
const WORDS = {
  en: {
    title: "This page wandered off.",
    body: "We followed the tracks as far as the edge of the screen. Whatever was here isn't here now.",
    home: "Back to today's colors",
    alerts: "Set up an alert",
  },
  es: {
    title: "Esta página se fue caminando.",
    body: "Seguimos las huellas hasta la orilla de la pantalla. Lo que había aquí ya no está.",
    home: "Volver a los colores de hoy",
    alerts: "Crear una alerta",
  },
} as const;

export default function NotFound() {
  return (
    <Suspense fallback={<Lost lang="en" />}>
      <LostInYourLanguage />
    </Suspense>
  );
}

async function LostInYourLanguage() {
  return <Lost lang={await getLang()} />;
}

function Lost({ lang }: { lang: "en" | "es" }) {
  const s = WORDS[lang];
  return (
    <article className="pt-10 sm:pt-16">
      <p className="font-display text-sm font-semibold tracking-[0.2em] text-accent">404</p>
      <h1 className="mt-2 text-4xl font-bold sm:text-5xl">{s.title}</h1>
      <p className="mt-3 max-w-prose text-fg-muted">{s.body}</p>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href="/" className="btn-primary">
          {s.home}
        </Link>
        <Link href="/notify" className="link text-sm">
          {s.alerts}
        </Link>
      </div>
      <Tracks />
    </article>
  );
}

/** One big bare foot, toes up, in a 20 x 34 box. */
function Foot({ left }: { left: boolean }) {
  return (
    <svg viewBox="0 0 20 34" className="block h-full w-full" style={left ? undefined : { transform: "scaleX(-1)" }}>
      <path d="M9.6 33.6c-3.6 0-5.6-2.8-5.6-6.2 0-2.8 1.2-4.8 1-7.8-.2-3.4-2.2-5.2-1.6-8.8.5-3 3-4.6 6.4-4.6 3.6 0 6.6 2.2 6.6 6 0 3-1.4 5-1.4 8 0 3.6 1.2 5.6.4 8.4-.8 2.9-2.8 5-5.8 5z" />
      <circle cx="3.6" cy="5.4" r="1.7" />
      <circle cx="7.2" cy="2.9" r="1.9" />
      <circle cx="11.1" cy="2.2" r="2" />
      <circle cx="14.8" cy="3.2" r="1.8" />
      <circle cx="17.6" cy="5.6" r="1.5" />
    </svg>
  );
}

function Tracks() {
  // Nine steps from the left, climbing a little and leaving by the right-hand edge. Left and right feet
  // alternate either side of the line he walked; the older prints have faded more than the fresh ones.
  const steps = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return { i, left: i % 2 === 0, x: 2 + t * 100, y: 18 + t * 44 + (i % 2 === 0 ? 9 : -9), fresh: 0.28 + t * 0.5 };
  });
  return (
    <div aria-hidden className="relative -mx-4 mt-10 h-40 overflow-hidden sm:mt-14 sm:h-48">
      {steps.map((p) => (
        <span
          key={p.i}
          className="absolute h-[34px] w-5 motion-safe:animate-[rise_0.5s_ease-out_both] sm:h-[44px] sm:w-[26px]"
          style={{ left: `${p.x}%`, bottom: `${p.y}%`, animationDelay: `${0.3 + p.i * 0.28}s` }}
        >
          {/* pointing the way he went: mostly right, slightly up */}
          <span className="block h-full w-full fill-[var(--line)]" style={{ transform: "rotate(66deg)", filter: "brightness(1.5)", opacity: p.fresh }}>
            <Foot left={p.left} />
          </span>
        </span>
      ))}
    </div>
  );
}
