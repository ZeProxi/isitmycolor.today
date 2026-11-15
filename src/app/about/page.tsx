import { Suspense } from "react";
import Link from "next/link";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { Disclaimer } from "@/components/Disclaimer";
import { PageSkeleton } from "@/components/PageSkeleton";
import { WHY } from "@/content/why";
import { loadOwnerWhy } from "@/lib/owner-content";

export default function AboutPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AboutContent />
    </Suspense>
  );
}

async function AboutContent() {
  const lang = await getLang();
  const dict = t(lang);
  const s = dict.about;
  const w = dict.why;
  const why = WHY ?? (await loadOwnerWhy());
  return (
    <div className="space-y-8 pt-6 sm:pt-10">
      <h1 className="text-4xl font-bold sm:text-5xl">{s.title}</h1>

      {why && (
      <section className="glass glass-strong rounded-3xl p-6 sm:p-8">
        <h2 className="text-2xl font-bold">{why.title[lang]}</h2>
        <p className="mt-3 max-w-prose text-fg-muted">{why.intro[lang]}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {why.people.map((p) => (
            <figure key={p.photo} className="flex flex-col gap-3 rounded-2xl bg-black/20 p-3 ring-1 ring-white/10 sm:flex-row sm:gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.photo}
                alt={p.name[lang]}
                className="h-60 w-full shrink-0 rounded-xl object-cover object-top sm:h-[140px] sm:w-[112px]"
              />
              <figcaption className="min-w-0 text-sm">
                <p className="text-base font-bold leading-tight">{p.name[lang]}</p>
                <p className="text-fg-muted">{p.relation[lang]}</p>
                <p className="mt-0.5 text-xs text-fg-faint">{p.dates[lang]}</p>
                <p className="mt-2 leading-relaxed text-fg-muted">{p.body[lang]}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-5">
          <p className="text-lg font-bold">{w.notAloneTitle}</p>
          <p className="mt-1 max-w-prose text-sm text-fg-muted">{w.notAlone}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="tel:988" className="btn-primary text-sm">
              {w.call988}
            </a>
            <Link href="/resources" className="btn-ghost text-sm">
              {w.moreHelp}
            </Link>
          </div>
        </div>
      </section>
      )}

      <section className="glass rounded-3xl p-6 sm:p-8">
        <h2 className="text-2xl font-bold">{s.how}</h2>
        <ol className="mt-4 max-w-prose space-y-3 text-sm leading-relaxed text-fg-muted">
          {s.steps.map(([lead, body]) => (
            <li key={lead}>
              <strong className="text-fg">{lead}</strong> {body}
            </li>
          ))}
        </ol>
      </section>

      <section className="glass rounded-3xl p-6 sm:p-8">
        <h2 className="text-2xl font-bold">{dict.faq.title}</h2>
        <div className="mt-3 divide-y divide-white/10">
          {dict.faq.items.map(([q, a]) => (
            <details key={q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {q}
                <svg className="h-4 w-4 shrink-0 text-fg-muted transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <p className="mt-2 max-w-prose text-sm text-fg-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <Disclaimer />

      <section className="max-w-prose text-sm text-fg-muted">
        <h2 className="text-2xl font-bold text-fg">{s.openSource}</h2>
        <p className="mt-3">{s.openSourceText}</p>
        <a className="btn-ghost mt-4 text-sm" href="https://github.com/ZeProxi/isitmycolor.today" target="_blank" rel="noreferrer">
          github.com/ZeProxi/isitmycolor.today
        </a>
      </section>
    </div>
  );
}
