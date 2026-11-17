import Link from "next/link";
import type { ColorsSnapshot } from "@/lib/scrape";
import { colorInfo } from "@/lib/colors";
import { t, type Lang } from "@/lib/i18n";

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
}: {
  month: string;
  days: ColorsSnapshot[];
  today: string;
  lang: Lang;
  /** the signed-in person's color keys; matching bars are highlighted */
  mine?: string[];
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
        <Link href={`/history?month=${shiftMonth(month, -1)}`} className="link text-sm">
          ‹ {monthLabel(shiftMonth(month, -1), lang, "short")}
        </Link>
        <h2 className="text-lg font-bold capitalize">{monthLabel(month, lang)}</h2>
        <Link href={`/history?month=${shiftMonth(month, 1)}`} className="link text-sm">
          {monthLabel(shiftMonth(month, 1), lang, "short")} ›
        </Link>
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

      {/* phones: a readable list instead of the grid */}
      <ol className="mt-4 space-y-2 sm:hidden">
        {days.length === 0 && <li className="panel rounded-md px-4 py-3 text-sm text-fg-muted">{s.noneThisMonth}</li>}
        {days
          .filter((d) => d.date)
          .slice()
          .reverse()
          .map((d) => {
            const date = d.date as string;
            const isToday = date === today;
            return (
              <li key={date}>
                <Link
                  href={`/day/${date}`}
                  className={`panel flex items-center gap-3 rounded-md px-4 py-3 ${isToday ? "ring-2 ring-accent" : ""}`}
                >
                  <span className="w-14 shrink-0">
                    <span className="block text-lg font-bold leading-none">{Number(date.slice(-2))}</span>
                    <span className="block text-xs text-fg-muted">{WEEKDAYS[new Date(date + "T12:00:00Z").getUTCDay()]}</span>
                  </span>
                  <span className="flex flex-1 flex-wrap gap-1.5">
                    {d.colors.length === 0 && <span className="text-sm text-fg-muted">{s.none}</span>}
                    {d.colors.map((c) => {
                      const info = colorInfo(c.key, c);
                      const isMine = mine.includes(c.key);
                      return (
                        <span
                          key={c.raw}
                          className={`rounded-sm px-2.5 py-1 text-sm font-bold ${isMine ? "ring-2 ring-white" : ""}`}
                          style={{ background: c.siteBackground ?? info.hex, color: info.text }}
                        >
                          <span className="relative capitalize">{lang === "es" ? c.spanish || c.english : c.english}</span>
                        </span>
                      );
                    })}
                  </span>
                  <svg className="h-4 w-4 shrink-0 text-fg-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            );
          })}
      </ol>
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
