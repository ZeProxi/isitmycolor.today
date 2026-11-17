import Link from "next/link";
import type { ColorsSnapshot } from "@/lib/scrape";
import { colorInfo } from "@/lib/colors";
import { t, type Lang } from "@/lib/i18n";
import { longDateMountain } from "@/lib/dates";
import { HistoryMobile } from "./HistoryMobile";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string, lang: Lang, style: "long" | "short" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

export function HistoryCalendar({
  month,
  days,
  today,
  lang,
  mine = [],
  firstMonth,
}: {
  month: string;
  days: ColorsSnapshot[];
  today: string;
  lang: Lang;
  /** the signed-in person's color keys; matching bars are highlighted */
  mine?: string[];
  /** earliest month with anything on record ("YYYY-MM"); there is no going back past it */
  firstMonth?: string;
}) {
  const s = t(lang).history;
  const WEEKDAYS = s.weekdays;
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = first.getUTCDay();
  const byDate = new Map(days.filter((d) => d.date).map((d) => [d.date as string, d]));

  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <section>
      <div className="flex items-center justify-between border-b border-line pb-3">
        {/* Nothing was recorded before the first month, and nothing exists after this one: no link, same spacing. */}
        {firstMonth && month <= firstMonth ? (
          <span />
        ) : (
          <Link href={`/history?month=${shiftMonth(month, -1)}`} className="link text-sm">
            ‹ {monthLabel(shiftMonth(month, -1), lang, "short")}
          </Link>
        )}
        <h2 className="text-lg font-bold capitalize">{monthLabel(month, lang)}</h2>
        {month >= today.slice(0, 7) ? (
          <span />
        ) : (
          <Link href={`/history?month=${shiftMonth(month, 1)}`} className="link text-sm">
            {monthLabel(shiftMonth(month, 1), lang, "short")} ›
          </Link>
        )}
      </div>

      <div className="panel mt-4 hidden rounded-lg p-3 sm:block sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-fg-faint">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} />;
            const snap = byDate.get(date);
            const isToday = date === today;
            const future = date > today;
            const cellClass = `flex min-h-16 flex-col rounded-md p-1 sm:min-h-24 sm:p-1.5 ${
              isToday ? "bg-white/10 ring-2 ring-accent" : snap ? "bg-black/30" : "bg-black/15"
            } ${future ? "opacity-30" : ""} ${snap ? "hover:ring-1 hover:ring-fg-faint" : ""}`;
            return (
              <CalendarCell key={date} href={snap ? `/day/${date}` : null} className={cellClass}>
                <div className="flex items-center justify-between px-0.5 text-[11px] sm:text-xs">
                  <span className={isToday ? "font-bold text-fg" : "text-fg-muted"}>{Number(date.slice(-2))}</span>
                  {snap?.announcement ? (
                    <span className="text-fg-faint" title={snap.announcement} aria-label={s.noticeMark}>
                      •
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-1 flex-col gap-1">
                  {snap ? (
                    snap.colors.length ? (
                      snap.colors.map((c) => {
                        const info = colorInfo(c.key, c);
                        const isMine = mine.includes(c.key);
                        const dimmed = mine.length > 0 && !isMine;
                        return (
                          <div
                            key={c.raw}
                            title={c.raw}
                            className={`h-4 overflow-hidden rounded-sm text-[10px] font-bold leading-4 sm:h-5 sm:px-1.5 sm:leading-5 ${
                              isMine ? "ring-2 ring-white" : dimmed ? "opacity-45" : ""
                            }`}
                            style={{ background: c.siteBackground ?? info.hex, color: info.text }}
                          >
                            <span className="relative hidden truncate sm:block">{lang === "es" ? c.spanish || c.english : c.english}</span>
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-[10px] text-fg-faint">{s.none}</span>
                    )
                  ) : null}
                </div>
              </CalendarCell>
            );
          })}
        </div>
      </div>

      {/* phones: a compact calendar; tapping a day spells it out underneath */}
      <HistoryMobile
        key={month}
        cells={cells}
        today={today}
        weekdays={WEEKDAYS}
        labels={{ none: s.noColors, open: s.openDay, nothing: s.noneThisMonth }}
        days={Object.fromEntries(
          Array.from(byDate, ([date, snap]) => [
            date,
            {
              label: longDateMountain(date, lang),
              colors: snap.colors.map((c) => {
                const info = colorInfo(c.key, c);
                return { key: c.key, name: lang === "es" ? c.spanish || c.english : c.english, hex: c.siteBackground ?? info.hex, text: info.text, mine: mine.includes(c.key) };
              }),
            },
          ]),
        )}
      />
    </section>
  );
}

function CalendarCell({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}
