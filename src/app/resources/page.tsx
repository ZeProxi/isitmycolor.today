import { Suspense } from "react";
import type { Metadata } from "next";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { RESOURCE_SECTIONS } from "@/lib/resources";
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
        <section key={sec.id} id={sec.id}>
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
      ))}

      <p className="max-w-prose text-xs text-fg-faint">{s.footnote}</p>
    </div>
  );
}
