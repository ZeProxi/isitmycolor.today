import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDayRecord } from "@/lib/dynamo";
import { longDateMountain } from "@/lib/dates";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { colorInfo } from "@/lib/colors";
import { PageSkeleton } from "@/components/PageSkeleton";
import { SavedPageFrame } from "@/components/SavedPageFrame";
import { getScreenshot } from "@/lib/screenshot";

/** /day/2026-11-15: the official page as it looked that day. Text-message links point here. */
export default function DayPage({ params }: PageProps<"/day/[date]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DayContent params={params} />
    </Suspense>
  );
}

async function DayContent({ params }: { params: PageProps<"/day/[date]">["params"] }) {
  await connection(); // the signed screenshot link is time-based, so render per request
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const lang = await getLang();
  const s = t(lang);
  const [rec, shot] = await Promise.all([getDayRecord(date), getScreenshot(date)]);
  if (!rec && !shot) notFound();

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === "es" ? "es-US" : "en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" });
  const snap = rec?.snapshot;

  return (
    <div className="space-y-5 pt-6 sm:pt-10">
      <Link
        href={`/history?month=${date.slice(0, 7)}`}
        className="inline-flex items-center gap-2 rounded-full bg-white/8 py-1.5 pl-3 pr-4 text-sm font-medium text-fg ring-1 ring-white/15 transition hover:bg-white/15"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {s.day.backHistory}
      </Link>

      <div>
        <h1 className="text-3xl font-bold capitalize sm:text-5xl">{longDateMountain(date, lang)}</h1>
        <p className="mt-2 text-sm text-fg-muted">{s.day.intro}</p>
      </div>

      {shot ? (
        <figure className="glass overflow-hidden rounded-3xl bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt={`wasatch.org/colors on ${date}`} className="block w-full" />
          <figcaption className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-ink/60">
            <span>{shot.capturedAt ? s.day.screenshotCaptured(fmtTime(shot.capturedAt)) : ""}</span>
            <a className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90" href={shot.downloadUrl}>
              {s.day.downloadPng}
            </a>
          </figcaption>
        </figure>
      ) : snap ? (
        // No screenshot for this day: show the colors from the saved record instead.
        <div className="flex flex-wrap gap-2">
          {snap.colors.map((c) => {
            const info = colorInfo(c.key, c);
            return (
              <span key={c.raw} className="gloss relative rounded-xl px-4 py-2 text-lg font-bold" style={{ background: c.siteBackground ?? info.hex, color: info.text }}>
                <span className="relative">{c.raw}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      {rec?.rawHtml && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-fg-muted hover:text-fg">
            <svg className="h-4 w-4 transition group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
            {s.day.copyTitle}
          </summary>
          <div className="mt-3">
            <SavedPageFrame
              html={rec.rawHtml}
              caption={snap ? s.day.captured(fmtTime(snap.fetchedAt)) : undefined}
              downloadHref={`/day/${date}/source`}
              downloadLabel={s.day.downloadHtml}
            />
          </div>
        </details>
      )}
    </div>
  );
}
