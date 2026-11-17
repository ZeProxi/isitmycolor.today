import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getAnalytics } from "@/lib/analytics";
import { todayIsoMountain, longDateMountain } from "@/lib/dates";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { PageSkeleton } from "@/components/PageSkeleton";

export const metadata: Metadata = { title: "Analytics", robots: { index: false, follow: false } };

const PAGE_SIZE = 30;

export default function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalyticsContent searchParams={searchParams} />
    </Suspense>
  );
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();
const pct = (n: number) => `${Math.round(n * 100)}%`;

async function AnalyticsContent({ searchParams }: { searchParams: PageProps<"/analytics">["searchParams"] }) {
  await connection();
  // The owner's view only. To everyone else this page does not exist.
  if (!(await isAdmin())) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const lang = await getLang();
  const s = t(lang).analytics;
  const today = todayIsoMountain();
  let a;
  try {
    a = await getAnalytics(today);
  } catch (e) {
    return <p className="panel mt-8 rounded-md px-4 py-3 text-sm text-danger">{e instanceof Error ? e.message : String(e)}</p>;
  }
  const name = (c: { english: string; spanish: string }) => (lang === "es" && c.spanish ? c.spanish : c.english);
  const maxCount = Math.max(1, ...a.colors.map((c) => c.count));
  const weekdays = t(lang).history.weekdays;

  return (
    <div className="space-y-10 pt-6 sm:pt-10">
      <div>
        <h1 className="text-4xl font-bold sm:text-5xl">{s.title}</h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">{s.intro}</p>
      </div>

      {/* headline tiles */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={s.daysRecorded} value={String(a.daysRecorded)} sub={a.firstDate ? `${s.since} ${longDateMountain(a.firstDate, lang)}` : ""} />
        <Tile label={s.totalCalls} value={String(a.totalCalls)} />
        <Tile label={s.avgPerDay} value={fmt1(a.avgPerDay)} />
        <Tile label={s.distinctColors} value={String(a.colors.length)} />
      </section>

      {/* frequency per color */}
      <section>
        <h2 className="text-2xl font-bold">{s.freqTitle}</h2>
        {s.freqHelp && <p className="mt-1 text-sm text-fg-muted">{s.freqHelp}</p>}
        {a.colors.length === 0 ? (
          <p className="panel mt-4 rounded-md px-4 py-3 text-sm text-fg-muted">{s.noData}</p>
        ) : (
          <div className="panel mt-4 rounded-lg p-4 sm:p-6">
            <ol className="space-y-2">
              {a.colors.map((c) => (
                <li key={c.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[140px_1fr_auto]">
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.hex }} />
                    <span className="truncate font-medium">{name(c)}</span>
                  </span>
                  <span className="relative h-3 overflow-hidden rounded-r-[4px] bg-white/5">
                    <span
                      className="absolute inset-y-0 left-0 rounded-r-[4px]"
                      style={{ width: `${(c.count / maxCount) * 100}%`, background: c.hex }}
                      title={`${name(c)}: ${c.count}`}
                    />
                  </span>
                  <span className="tabular-nums text-fg-muted">
                    <span className="font-semibold text-fg">{c.count}</span> · {pct(c.shareOfDays)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* recency + gaps: the table view */}
      {a.colors.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold">{s.recencyTitle}</h2>
          {s.recencyHelp && <p className="mt-1 text-sm text-fg-muted">{s.recencyHelp}</p>}
          <div className="panel mt-4 overflow-x-auto rounded-lg">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-fg-muted">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 font-medium">{s.colColor}</th>
                  <th className="px-4 py-3 font-medium">{s.colTimes}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{s.colShare}</th>
                  <th className="px-4 py-3 font-medium">{s.colLast}</th>
                  <th className="px-4 py-3 font-medium">{s.colSince}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{s.colGap}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{s.colLongestGap}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{s.colRepeat}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {a.colors.map((c) => (
                  <tr key={c.key}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm" style={{ background: c.hex }} />
                        <Link className="link" href={`/color/${encodeURIComponent(c.key)}`}>{name(c)}</Link>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{c.count}</td>
                    <td className="hidden px-4 py-2.5 tabular-nums sm:table-cell">{pct(c.shareOfDays)}</td>
                    <td className="px-4 py-2.5">{c.lastDate ? <Link className="link" href={`/day/${c.lastDate}`}>{c.lastDate}</Link> : "–"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{c.daysSinceLast ?? "–"}</td>
                    <td className="hidden px-4 py-2.5 tabular-nums sm:table-cell">{c.avgGap === null ? "–" : fmt1(c.avgGap)}</td>
                    <td className="hidden px-4 py-2.5 tabular-nums sm:table-cell">{c.longestGap === null ? "–" : c.longestGap}</td>
                    <td className="hidden px-4 py-2.5 tabular-nums sm:table-cell">{c.repeatNextDay ? `${c.repeatNextDay.times}/${c.repeatNextDay.of}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* colors per day + weekday */}
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold">{s.perDayTitle}</h2>
          {s.perDayHelp && <p className="mt-1 text-sm text-fg-muted">{s.perDayHelp}</p>}
          <div className="panel mt-4 rounded-lg p-4 sm:p-6">
            {a.perDayHistogram.filter((n) => n > 0).length === 0 ? (
              <p className="text-sm text-fg-muted">{s.noData}</p>
            ) : (
              <ol className="space-y-2">
                {a.perDayHistogram.map((n, count) =>
                  n > 0 ? (
                    <li key={count} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-sm">
                      <span className="font-medium">{s.nColors(count)}</span>
                      <span className="relative h-3 overflow-hidden rounded-r-[4px] bg-white/5">
                        <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-fg-muted" style={{ width: `${(n / Math.max(...a.perDayHistogram)) * 100}%` }} />
                      </span>
                      <span className="tabular-nums text-fg-muted">
                        <span className="font-semibold text-fg">{n}</span> {s.days}
                      </span>
                    </li>
                  ) : null,
                )}
              </ol>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold">{s.weekdayTitle}</h2>
          {s.weekdayHelp && <p className="mt-1 text-sm text-fg-muted">{s.weekdayHelp}</p>}
          <div className="panel mt-4 rounded-lg p-4 sm:p-6">
            <ol className="space-y-2">
              {a.byWeekday.map((w) => (
                <li key={w.weekday} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 text-sm">
                  <span className="font-medium">{weekdays[w.weekday]}</span>
                  <span className="relative h-3 overflow-hidden rounded-r-[4px] bg-white/5">
                    <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-fg-muted" style={{ width: `${(w.calls / Math.max(1, ...a.byWeekday.map((x) => x.calls))) * 100}%` }} />
                  </span>
                  <span className="tabular-nums text-fg-muted">
                    <span className="font-semibold text-fg">{w.calls}</span> / {w.days} {s.days}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* patterns */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{s.patternsTitle}</h2>
          {s.patternsHelp && <p className="mt-1 text-sm text-fg-muted">{s.patternsHelp}</p>}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-lg font-bold">{s.repeatTitle}</h3>
            {s.repeatHelp && <p className="mt-1 text-sm text-fg-muted">{s.repeatHelp}</p>}
            <div className="panel mt-3 rounded-lg p-4 sm:p-6">
              {a.repeat ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-fg-muted">{s.repeatObserved}</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums">{a.repeat.observed}</p>
                    <p className="text-xs text-fg-faint">{s.ofDays(a.repeat.days)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-fg-muted">{s.repeatExpected}</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums">{fmt1(a.repeat.expected)}</p>
                    <p className="text-xs text-fg-faint">{s.ofDays(a.repeat.days)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-fg-muted">{s.needMore(2)}</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold">{s.trendTitle}</h3>
            {s.trendHelp && <p className="mt-1 text-sm text-fg-muted">{s.trendHelp}</p>}
            <div className="panel mt-3 rounded-lg p-4 sm:p-6">
              {a.colors.some((c) => c.recentShare !== null) ? (
                <ol className="space-y-2 text-sm">
                  {a.colors.map((c) => (
                    <li key={c.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
                      <span className="flex items-center gap-2 truncate">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.hex }} />
                        <span className="truncate">{name(c)}</span>
                      </span>
                      <span className="relative h-3 overflow-hidden rounded-r-[4px] bg-white/5">
                        <span className="absolute inset-y-0 left-0 h-full rounded-r-[4px] opacity-40" style={{ width: `${c.shareOfDays * 100}%`, background: c.hex }} />
                        <span className="absolute inset-y-0 left-0 h-full rounded-r-[4px]" style={{ width: `${(c.recentShare ?? 0) * 100}%`, background: c.hex }} />
                      </span>
                      <span className="tabular-nums text-fg-muted">
                        <span className="font-semibold text-fg">{pct(c.recentShare ?? 0)}</span> / {pct(c.shareOfDays)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-fg-muted">{s.needMore(7)}</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold">{s.pairsTitle}</h3>
          {s.pairsHelp && <p className="mt-1 text-sm text-fg-muted">{s.pairsHelp}</p>}
          <div className="panel mt-3 overflow-x-auto rounded-lg">
            {a.pairs.length === 0 ? (
              <p className="px-4 py-3 text-sm text-fg-muted">{s.needMore(2)}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-fg-muted">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 font-medium">{s.colPair}</th>
                    <th className="px-4 py-3 font-medium">{s.colTogether}</th>
                    <th className="px-4 py-3 font-medium">{s.colExpected}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {a.pairs.map((pr) => {
                    const ca = a.colors.find((x) => x.key === pr.a);
                    const cb = a.colors.find((x) => x.key === pr.b);
                    return (
                      <tr key={`${pr.a}-${pr.b}`}>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-sm" style={{ background: ca?.hex }} />
                            {ca ? name(ca) : pr.a}
                            <span className="text-fg-faint">+</span>
                            <span className="h-3 w-3 rounded-sm" style={{ background: cb?.hex }} />
                            {cb ? name(cb) : pr.b}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{pr.together}</td>
                        <td className="px-4 py-2.5 tabular-nums text-fg-muted">{fmt1(pr.expected)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* hotline counter */}
      {a.counter && (
        <section>
          <h2 className="text-2xl font-bold">{s.counterTitle}</h2>
          {s.counterHelp && <p className="mt-1 text-sm text-fg-muted">{s.counterHelp}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label={s.counterFirst} value={String(a.counter.min)} sub={a.counter.firstDate} />
            <Tile label={s.counterLast} value={String(a.counter.max)} sub={a.counter.lastDate} />
            <Tile label={s.counterRate} value={fmt1(a.counter.impliedPerDay)} />
          </div>
        </section>
      )}

      {/* recorded days, paginated newest first */}
      <section id="days">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-bold">{s.daysTitle}</h2>
          {a.days.length > 0 && (
            <span className="text-xs text-fg-muted">
              {s.showing(Math.min((page - 1) * PAGE_SIZE + 1, a.days.length), Math.min(page * PAGE_SIZE, a.days.length), a.days.length)}
            </span>
          )}
        </div>
        <div className="panel mt-4 overflow-x-auto rounded-lg">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-fg-muted">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 font-medium">{s.colDate}</th>
                <th className="px-4 py-3 font-medium">{s.colColors}</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">{s.colIds}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {a.days.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((d) => (
                <tr key={d.date}>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <Link className="link" href={`/day/${d.date}`}>{d.date}</Link>
                    <span className="ml-2 text-fg-faint">{weekdays[d.weekday]}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1.5">
                      {d.colors.map((k) => {
                        const c = a.colors.find((x) => x.key === k);
                        return (
                          <span key={k} className="flex items-center gap-1.5 text-xs">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c?.hex }} />
                            {c ? name(c) : k}
                          </span>
                        );
                      })}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2.5 tabular-nums text-fg-muted sm:table-cell">{d.ids.length ? `${Math.min(...d.ids)}–${Math.max(...d.ids)}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {a.days.length > PAGE_SIZE && (
          <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Pagination">
            {page > 1 ? (
              <Link className="btn-ghost px-4 py-1.5 text-sm" href={`/analytics?page=${page - 1}#days`}>
                ‹ {s.prev}
              </Link>
            ) : (
              <span />
            )}
            {page * PAGE_SIZE < a.days.length ? (
              <Link className="btn-ghost px-4 py-1.5 text-sm" href={`/analytics?page=${page + 1}#days`}>
                {s.next} ›
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>

      <p className="max-w-prose text-xs text-fg-faint">{s.disclaimer}</p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel rounded-md p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-fg-faint">{sub}</p>}
    </div>
  );
}
