import { cookies } from "next/headers";
import { connection } from "next/server";
import Link from "next/link";
import { getTodayColors } from "@/lib/today";
import { todayIsoMountain, longDateMountain } from "@/lib/dates";
import { colorInfo, everyoneCalled, matchedColors } from "@/lib/colors";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { mineToday } from "@/lib/mine";
import { DayMoment } from "./DayMoment";

function cap(w: string) {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export async function TodayColors() {
  await connection(); // render at request time so "today" is the real today
  const lang = await getLang();
  const s = t(lang).home;
  const [data, me] = await Promise.all([getTodayColors(), mineToday()]);
  const mine = me.colors;
  const today = todayIsoMountain();

  if ("error" in data) {
    return (
      <section className="panel rounded-lg p-6 sm:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">{s.unreachable}</h1>
        <p className="mt-2 max-w-prose text-fg-muted">{data.error}</p>
        <a className="btn-ghost mt-5" href="https://wasatch.org/colors/">
          {s.openSource}
        </a>
      </section>
    );
  }

  const stale = data.date !== null && data.date !== today;
  const fetched = new Date(data.fetchedAt).toLocaleTimeString(lang === "es" ? "es-US" : "en-US", {
    timeZone: "America/Denver",
    hour: "numeric",
    minute: "2-digit",
  });
  const n = data.colors.length;
  // Three or more full-width tiles push everything else off a phone screen, so
  // from three up they go two-across and shorter there. Wider screens are unchanged.
  const compact = n >= 3;
  const todayKeys = new Set(data.colors.map((c) => c.key));
  const matched = matchedColors(mine, todayKeys);
  const everyone = everyoneCalled(todayKeys);
  const mineNames = mine.map((k) => {
    const i = colorInfo(k, data.colors.find((c) => c.key === k));
    return lang === "es" && i.spanish ? i.spanish : i.english;
  });

  // The once-a-day animation needs today's real list and someone with colors chosen.
  const firstMine = data.colors.find((c) => matched.includes(c.key)) ?? (everyone && matched.length ? data.colors[0] : undefined);
  const momentHex = firstMine ? (firstMine.siteBackground ?? colorInfo(firstMine.key, firstMine).hex) : "#edb058";

  // Whether today's banner is still to come is known here, on the server, so it arrives with the page and
  // covers it from the start: the colors are never shown first and then covered a moment later.
  const moment = mine.length > 0 && !stale && n > 0 && data.layout !== "fallback";
  // In development only, a `moment-test` cookie makes the banner due on every load, so the way it arrives
  // with the page can be watched without waiting for tomorrow. It has no effect on the live site.
  const rehearsal = process.env.NODE_ENV !== "production" && (await cookies()).has("moment-test");
  const pending = moment && (me.momentDate !== today || rehearsal);

  return (
    <section className={pending ? "moment-hold" : undefined}>
      {moment && (
        <DayMoment pending={pending} kind={matched.length ? "mine" : "clear"} hex={momentHex} ink={firstMine ? colorInfo(firstMine.key, firstMine).text : "#fff"} label={s.yoursUp} clearLabel={t(lang).emailSubject.noMatch} />
      )}
      <div className="rise flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-sm font-medium text-fg-muted">
            {data.date ? cap(longDateMountain(data.date, lang)) : s.today}
          </p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
            {matched.length ? s.yoursUp : n === 0 ? s.noColors : n === 1 ? s.oneColor : s.nColors(n)}
          </h1>
          {mine.length > 0 && matched.length === 0 && n > 0 && data.layout !== "fallback" && (
            <p className="mt-2 text-sm text-fg-muted">{s.notYours(mineNames.join(", "))}</p>
          )}
        </div>
        <p className="text-xs text-fg-muted">{s.live(fetched)}</p>
      </div>

      {stale && <p className="panel mt-4 rounded-md px-4 py-3 text-sm text-fg">{s.stale(data.dateText)}</p>}
      {data.layout === "fallback" && (
        <p className="mt-4 rounded-md border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm text-fg">
          {s.partial}{" "}
          <a className="font-semibold underline" href="https://wasatch.org/colors/">
            wasatch.org/colors
          </a>
        </p>
      )}

      {n > 0 && (
        <div
          className={`mt-6 grid ${
            n === 1
              ? "grid-cols-1 gap-4"
              : n === 2
                ? "grid-cols-1 gap-4 sm:grid-cols-2"
                : "grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
          }`}
        >
          {data.colors.map((c, idx) => {
            // An odd one out at the end fills the row on phones instead of leaving a hole.
            const wide = compact && n % 2 === 1 && idx === n - 1;
            const info = colorInfo(c.key, c);
            const hex = c.siteBackground ?? info.hex; // the page's own color wins
            const primary = lang === "es" ? c.spanish || info.spanish || c.english : c.english;
            const secondary = lang === "es" ? c.english : c.spanish || info.spanish;
            const isMine = mine.includes(c.key) || (everyone && mine.length > 0);
            const dimmed = matched.length > 0 && !isMine;
            return (
              <Link
                key={c.raw}
                data-mine-today={isMine ? "" : undefined}
                href={`/color/${encodeURIComponent(c.key)}`}
                style={{ "--i": idx, color: info.text } as React.CSSProperties}
                className={`chip-in group relative flex flex-col justify-end overflow-hidden rounded-md border border-white/15 bg-ink-2 sm:min-h-48 sm:p-6 ${
                  compact ? "min-h-28 p-4" : "min-h-40 p-5"
                } ${wide ? "col-span-2 sm:col-span-1" : ""} ${dimmed ? "opacity-50" : ""} ${
                  isMine ? "outline outline-[3px] outline-offset-[3px] outline-accent" : ""
                }`}
              >
                {/* the color itself, rolled on from the left when the page loads */}
                <span aria-hidden className="paint absolute inset-0" style={{ background: hex }} />
                {isMine && (
                  <span
                    className={`absolute rounded-sm bg-white font-bold text-ink sm:right-4 sm:top-4 sm:px-3 sm:py-1 sm:text-xs ${
                      compact ? "right-2.5 top-2.5 px-2 py-0.5 text-[11px]" : "right-4 top-4 px-3 py-1 text-xs"
                    }`}
                  >
                    {s.yourColor}
                  </span>
                )}
                <span className="chip-label relative flex flex-col">
                  <span
                    className={`display break-words font-bold leading-none ${
                      primary.length > 9
                        ? `${compact ? "text-2xl" : "text-4xl"} sm:text-5xl`
                        : primary.length > 6
                          ? `${compact ? "text-3xl" : "text-5xl"} sm:text-6xl`
                          : `${compact ? "text-4xl" : "text-6xl"} sm:text-7xl`
                    }`}
                  >
                    {cap(primary)}
                  </span>
                  {secondary && (
                    <span className={`font-medium opacity-80 sm:mt-2 sm:text-lg ${compact ? "mt-1 text-sm" : "mt-2 text-lg"}`}>{secondary}</span>
                  )}
                </span>
                {/* says "this opens" without needing hover, for phones */}
                <svg className="absolute bottom-3 right-3 h-5 w-5 opacity-45 group-hover:opacity-100 sm:bottom-5 sm:right-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}

      {data.announcement && (
        <div className="rise panel mt-4 flex gap-3 rounded-md px-4 py-3 text-sm" style={{ "--d": 500 + n * 110 } as React.CSSProperties}>
          <span aria-hidden className="mt-0.5 text-fg-muted">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 13V9a1 1 0 0 1 1-1h3l7-4v16l-7-4H5a1 1 0 0 1-1-1zM19 9a4 4 0 0 1 0 6" />
            </svg>
          </span>
          <p className="text-fg-muted">
            <span className="font-semibold text-fg">{s.notice} </span>
            {data.announcement}
          </p>
        </div>
      )}

      <div className="rise mt-6 flex flex-wrap items-center gap-3" style={{ "--d": 600 + n * 110 } as React.CSSProperties}>
        {mine.length === 0 ? (
          <Link href="/notify" className="btn-primary">
            {s.ctaText}
          </Link>
        ) : (
          <Link href="/notify" className="btn-ghost">
            {s.ctaYourAlerts}
          </Link>
        )}
        <Link href="/history" className="btn-ghost">
          {s.ctaHistory}
        </Link>
      </div>
    </section>
  );
}

export function TodayColorsSkeleton() {
  return (
    <section className="animate-pulse">
      <div className="h-4 w-40 rounded bg-white/10" />
      <div className="mt-3 h-11 w-72 rounded bg-white/10" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-h-40 rounded-md bg-white/8 sm:min-h-48" />
        <div className="min-h-40 rounded-md bg-white/8 sm:min-h-48" />
      </div>
    </section>
  );
}
