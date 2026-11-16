import { Fragment, Suspense } from "react";
import type { Metadata } from "next";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { RESOURCE_SECTIONS, COMMUNITIES } from "@/lib/resources";
import { PageSkeleton } from "@/components/PageSkeleton";

export const metadata: Metadata = { title: "Resources" };

export default function ResourcesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ResourcesContent />
    </Suspense>
  );
}

async function ResourcesContent() {
  const lang = await getLang();
  const s = t(lang).resources;

  return (
    <div className="space-y-10 pt-6 sm:pt-10">
      <div>
        <h1 className="text-4xl font-bold sm:text-5xl">{s.title}</h1>
        <p className="mt-3 max-w-prose text-fg-muted">{s.intro}</p>
      </div>

      {/* the two numbers that matter most, up top and big */}
      <div className="grid gap-3 sm:grid-cols-2">
        <a href="tel:988" className="glass glass-strong flex items-center justify-between rounded-3xl p-5 transition hover:bg-white/10">
          <span>
            <span className="block text-sm text-fg-muted">{s.crisisLabel}</span>
            <span className="display block text-4xl font-extrabold">988</span>
          </span>
          <span className="text-sm text-fg-muted">{s.callOrText}</span>
        </a>
        <a href="tel:911" className="glass flex items-center justify-between rounded-3xl p-5 transition hover:bg-white/10">
          <span>
            <span className="block text-sm text-fg-muted">{s.emergencyLabel}</span>
            <span className="display block text-4xl font-extrabold">911</span>
          </span>
          <span className="max-w-[12rem] text-right text-sm text-fg-muted">{s.emergencyWhen}</span>
        </a>
      </div>

      {RESOURCE_SECTIONS.map((sec) => (
        <Fragment key={sec.id}>
        {sec.id === "prevention" && (
          <section id="communities">
            <h2 className="flex items-center gap-3 text-2xl font-bold">
              <RedditBadge size={32} />
              {s.communitiesTitle}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{s.communitiesHelp}</p>
            <ul className="glass mt-4 divide-y divide-white/10 rounded-3xl">
              {COMMUNITIES.map((c) => (
                <li key={c.name}>
                  <a href={c.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/5">
                    <RedditBadge size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{c.name}</span>
                      <span className="block text-sm text-fg-muted">{c.blurb[lang]}</span>
                    </span>
                    <svg className="h-4 w-4 shrink-0 text-fg-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 17L17 7M8 7h9v9" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section id={sec.id}>
          <h2 className="text-2xl font-bold">{sec.title[lang]}</h2>
          {sec.intro && <p className="mt-1 max-w-prose text-sm text-fg-muted">{sec.intro[lang]}</p>}
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {sec.items.map((r) => (
              <li key={r.name.en} className="glass flex flex-col rounded-3xl p-5">
                <h3 className="font-bold leading-snug">{r.name[lang]}</h3>
                <p className="mt-1 text-sm text-fg-muted">{r.blurb[lang]}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.actions.map((a, i) => (
                    <a
                      key={a.href}
                      href={a.href}
                      className={i === 0 ? "btn-primary px-4 py-1.5 text-sm" : "btn-ghost px-4 py-1.5 text-sm"}
                      {...(a.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                    >
                      {a.label[lang]}
                    </a>
                  ))}
                </div>
                {r.meta && <p className="mt-3 text-xs text-fg-faint">{r.meta[lang]}</p>}
              </li>
            ))}
          </ul>
        </section>
        </Fragment>
      ))}

      <p className="max-w-prose text-xs text-fg-faint">{s.footnote}</p>
    </div>
  );
}

function RedditBadge({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: "#FF4500" }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="#fff" style={{ width: size * 0.68, height: size * 0.68 }}>
        <path d="M22 12.1c0-1.2-1-2.2-2.2-2.2-.6 0-1.1.2-1.5.6-1.5-1-3.5-1.7-5.7-1.8l1-4.6 3.2.7c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5-.7-1.5-1.5-1.5c-.6 0-1.1.3-1.3.8l-3.6-.8c-.2 0-.4.1-.4.3l-1.1 5.1c-2.2.1-4.2.7-5.8 1.8-.4-.4-.9-.6-1.5-.6C3 9.9 2 10.9 2 12.1c0 .9.5 1.6 1.2 2-.1.3-.1.6-.1.9 0 3.3 3.9 6 8.8 6s8.8-2.7 8.8-6c0-.3 0-.6-.1-.9.8-.4 1.4-1.1 1.4-2zM7 13.6c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5-.7 1.5-1.5 1.5S7 14.4 7 13.6zm8.5 4c-1 1-2.6 1.1-3.5 1.1s-2.5-.1-3.5-1.1c-.2-.2-.2-.4 0-.6.2-.2.4-.2.6 0 .7.7 2 .8 2.9.8s2.2-.1 2.9-.8c.2-.2.4-.2.6 0 .1.2.1.5 0 .6zm-.1-2.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z" />
      </svg>
    </span>
  );
}
