import { Suspense } from "react";
import Link from "next/link";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { Disclaimer } from "@/components/Disclaimer";
import { PageSkeleton } from "@/components/PageSkeleton";
import { WHY } from "@/content/why";
import { ContactForm } from "@/components/ContactForm";
import { env } from "@/lib/env";
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-large.webp" alt="isitmycolor.today" width={720} height={434} className="mx-auto h-auto w-64 sm:w-[360px]" />
      <h1 className="text-4xl font-bold sm:text-5xl">{s.title}</h1>

      {why && (
        <section className="panel rounded-lg p-6 sm:p-8">
          <h2 className="text-2xl font-bold">{why.title[lang]}</h2>
          {/* written in paragraphs: blank lines in the text are kept */}
          <p className="mt-3 max-w-prose whitespace-pre-line text-fg-muted">{why.intro[lang]}</p>
        </section>
      )}

      {why && why.people.length > 0 && (
        <section className="panel rounded-lg p-6 sm:p-8">
          {/* The people this is for, set apart from the practical reason above. */}
          <div className="flex items-center gap-3">
            <Candle className="h-7 w-7 shrink-0 text-accent" />
            <h2 className="text-2xl font-bold">{why.memorial?.title?.[lang] ?? w.memTitle}</h2>
          </div>
          <p className="mt-3 max-w-prose text-fg-muted">{why.memorial?.intro?.[lang] ?? w.memIntro}</p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {why.people.map((p) => {
              const years = p.dates[lang].match(/\d{4}/g);
              return (
                <figure key={p.photo} className="flex flex-col overflow-hidden rounded-md border border-line-strong bg-black/25">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photo} alt={p.name[lang]} className="aspect-[4/5] w-full object-cover object-top" />
                  <figcaption className="border-t-2 border-accent p-5 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-faint">{w.inMemory}</p>
                    <p className="display mt-1 text-4xl font-bold leading-none">{p.name[lang]}</p>
                    <p className="mt-1.5 text-sm text-fg-muted">{p.relation[lang]}</p>
                    {years && years.length >= 2 && (
                      <p className="display mt-3 text-2xl font-semibold tracking-wide text-accent">
                        {years[0]} <span className="text-fg-faint">–</span> {years[years.length - 1]}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-fg-faint">{p.dates[lang]}</p>
                    <p className="mt-4 text-left text-sm leading-relaxed text-fg-muted">{p.body[lang]}</p>
                  </figcaption>
                </figure>
              );
            })}
          </div>

          <div className="mt-6 rounded-md border border-white/15 bg-white/5 p-5">
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

      <section className="panel rounded-lg p-6 sm:p-8">
        <h2 className="text-2xl font-bold">{s.how}</h2>
        <ol className="mt-4 max-w-prose space-y-3 text-sm leading-relaxed text-fg-muted">
          {s.steps.map(([lead, body]) => (
            <li key={lead}>
              <strong className="text-fg">{lead}</strong> {body}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel rounded-lg p-6 sm:p-8">
        <h2 className="text-2xl font-bold">{s.wrong}</h2>
        <ol className="mt-4 max-w-prose space-y-3 text-sm leading-relaxed text-fg-muted">
          {s.wrongSteps.map(([lead, body]) => (
            <li key={lead}>
              <strong className="text-fg">{lead}</strong> {body}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel rounded-lg p-6 sm:p-8">
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

      {env.contactEmail && <ContactForm />}

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

/** A small lit candle, for the memorial heading. */
function Candle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5c1.6 1.9 2.4 3.3 2.4 4.5a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.6 2.4-4.5z" fill="currentColor" stroke="none" />
      <path d="M12 9.5v2" />
      <rect x="8.5" y="11.5" width="7" height="9" rx="1" />
      <path d="M6.5 21h11" />
    </svg>
  );
}
