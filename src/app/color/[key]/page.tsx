import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getAnalytics } from "@/lib/analytics";
import { getSnapshot } from "@/lib/dynamo";
import { todayIsoMountain, longDateMountain } from "@/lib/dates";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { KNOWN_COLORS, colorInfo, normalizeColorKey, textOn } from "@/lib/colors";
import { withSeenColors } from "@/lib/seen-colors";
import { myColors } from "@/lib/mine";
import { PageSkeleton } from "@/components/PageSkeleton";

/** /color/red: one color's own page, in that color, with what the history says about it. */
export default function ColorPage({ params }: PageProps<"/color/[key]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ColorContent params={params} />
    </Suspense>
  );
}

/** How many of the latest dates get a full-size button. */
const RECENT = 5;

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();

async function ColorContent({ params }: { params: PageProps<"/color/[key]">["params"] }) {
  await connection(); // "today" and "days ago" are measured against the clock
  const key = normalizeColorKey(decodeURIComponent((await params).key));
  if (!key) notFound();
  const lang = await getLang();
  const dict = t(lang);
  const s = dict.color;
  const today = todayIsoMountain();

  const [seen, a, mine] = await Promise.all([withSeenColors(), getAnalytics(today, { withHtml: false }), myColors()]);
  const stat = a.colors.find((c) => c.key === key);
  // Only colors the hotline uses (built in, learned from the page, or on record) get a page.
  if (!stat && !KNOWN_COLORS.some((c) => c.key === key) && !seen.some((c) => c.key === key)) notFound();

  // Show the color the way the hotline page itself last painted it.
  const lastSnap = stat?.lastDate ? await getSnapshot(stat.lastDate).catch(() => null) : null;
  const onPage = lastSnap?.colors.find((c) => c.key === key);
  const info = colorInfo(key, onPage);
  const hex = onPage?.siteBackground ?? info.hex;
  const ink = textOn(hex);
  const name = lang === "es" && info.spanish ? info.spanish : info.english;
  const other = lang === "es" ? info.english : info.spanish;

  const dates = a.days.filter((d) => d.colors.includes(key)).map((d) => d.date); // newest first
  const listed = new Set(dates);
  const recorded = new Set(a.days.map((d) => d.date));
  // every month from the first one on record to this one, newest first, grouped by year
  const months: string[] = [];
  for (let m = today.slice(0, 7); a.firstDate && m >= a.firstDate.slice(0, 7); m = prevMonth(m)) months.push(m);
  const years = Array.from(
    months.reduce((map, m) => map.set(m.slice(0, 4), [...(map.get(m.slice(0, 4)) ?? []), m]), new Map<string, string[]>()),
  );
  const listedToday = stat?.lastDate === today;
  const maxWeekday = Math.max(1, ...(stat?.byWeekday ?? [0]));
  const weekdays = dict.history.weekdays;

  return (
    <div className="space-y-8 pt-6 sm:pt-10">
      <Link href="/" className="link inline-flex items-center gap-1.5 text-sm">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {s.back}
      </Link>

      <section className="rise rounded-md border border-white/15 px-5 pb-6 pt-16 sm:px-8 sm:pb-8 sm:pt-28" style={{ background: hex, color: ink }}>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="rounded-sm px-2 py-0.5" style={{ background: ink, color: hex }}>
            {listedToday ? s.listedToday : s.notToday}
          </span>
          {mine.includes(key) && <span className="rounded-sm border border-current px-2 py-0.5">{dict.home.yourColor}</span>}
        </div>
        <h1 className="mt-3 break-words text-7xl font-bold leading-[0.9] sm:text-9xl">{name}</h1>
        {other && <p className="mt-2 text-xl font-medium opacity-80 sm:text-2xl">{other}</p>}
      </section>

      {!stat ? (
        <p className="panel rounded-md px-4 py-3 text-sm text-fg-muted">{s.never}</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={s.times} value={String(stat.count)} sub={s.ofDays(a.daysRecorded)} />
            <Stat label={s.share} value={`${Math.round(stat.shareOfDays * 100)}%`} />
            <Stat
              label={s.last}
              value={s.ago(stat.daysSinceLast ?? 0)}
              sub={stat.lastDate ? longDateMountain(stat.lastDate, lang) : undefined}
              href={stat.lastDate ? `/day/${stat.lastDate}` : undefined}
            />
            <Stat label={s.gap} value={stat.avgGap === null ? "–" : s.days(fmt1(stat.avgGap))} sub={stat.longestGap === null ? undefined : s.longest(stat.longestGap)} />
          </section>

          <section>
            <h2 className="text-2xl font-bold">{s.weekdayTitle}</h2>
            <div className="panel mt-4 grid grid-cols-7 gap-2 rounded-lg p-4 sm:gap-4 sm:p-6">
              {stat.byWeekday.map((n, w) => (
                <div key={w} className="flex flex-col items-center gap-2">
                  <div className="flex h-28 w-full items-end bg-black/25">
                    <div className="w-full" style={{ height: `${(n / maxWeekday) * 100}%`, background: hex }} title={`${weekdays[w]}: ${n}`} />
                  </div>
                  <span className="text-xs text-fg-muted">{weekdays[w]}</span>
                  <span className="text-sm font-semibold tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{s.datesTitle}</h2>

            {/* the last few as buttons (easy to tap), then every recorded month as one compact row */}
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-fg-faint">{s.recent}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {dates.slice(0, RECENT).map((d) => (
                <li key={d}>
                  <Link href={`/day/${d}`} className="btn-ghost px-3 py-1.5 text-sm first-letter:uppercase">
                    {longDateMountain(d, lang)}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="panel mt-5 rounded-lg p-4 sm:p-5">
              {years.map(([year, months], yi) => {
                const grid = (
                  <div className="space-y-1">
                    {months.map((m) => (
                      <MonthRow key={m} month={m} listed={listed} recorded={recorded} hex={hex} today={today} locale={lang === "es" ? "es-US" : "en-US"} />
                    ))}
                  </div>
                );
                // this year stays open; earlier years fold away so the page doesn't grow forever
                return yi === 0 ? (
                  <div key={year}>
                    <p className="mb-2 text-sm font-semibold">{year}</p>
                    {grid}
                  </div>
                ) : (
                  <details key={year} className="mt-4 border-t border-line pt-3">
                    <summary className="cursor-pointer select-none text-sm font-semibold">{s.earlier(year)}</summary>
                    <div className="mt-2">{grid}</div>
                  </details>
                );
              })}
              <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: hex }} /> {s.legendListed}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-white/10" /> {s.legendNot}
                </span>
              </p>
            </div>
          </section>
        </>
      )}

      <p className="max-w-prose text-xs text-fg-faint">{s.disclaimer}</p>
    </div>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="display mt-1 text-4xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-fg-faint first-letter:uppercase">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="panel block rounded-md p-4 hover:border-fg-faint">
      {body}
    </Link>
  ) : (
    <div className="panel rounded-md p-4">{body}</div>
  );
}

/**
 * One month as a strip of 31 small squares, one per day: filled with the color
 * on days it was listed (and linked to that day's page), dim on days that were
 * recorded without it, empty where nothing was recorded.
 */
function MonthRow({ month, listed, recorded, hex, today, locale }: { month: string; listed: Set<string>; recorded: Set<string>; hex: string; today: string; locale: string }) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  return (
    <div className="grid items-center gap-[2px]" style={{ gridTemplateColumns: "2.25rem repeat(31, minmax(0, 1fr))" }}>
      <span className="text-xs capitalize text-fg-muted">{label}</span>
      {Array.from({ length: 31 }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, "0")}`;
        if (i >= daysInMonth || date > today) return <span key={i} />;
        if (listed.has(date)) {
          return <Link key={i} href={`/day/${date}`} title={date} aria-label={date} className="aspect-square rounded-[2px] hover:outline hover:outline-2 hover:outline-fg" style={{ background: hex }} />;
        }
        return <span key={i} title={date} className={`aspect-square rounded-[2px] ${recorded.has(date) ? "bg-white/10" : "border border-white/5"}`} />;
      })}
    </div>
  );
}
