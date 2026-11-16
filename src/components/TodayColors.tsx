import { connection } from "next/server";
import Link from "next/link";
import { getTodayColors } from "@/lib/today";
import { todayIsoMountain, longDateMountain } from "@/lib/dates";
import { colorInfo } from "@/lib/colors";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { myColors } from "@/lib/mine";

function cap(w: string) {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export async function TodayColors() {
  await connection(); // render at request time so "today" is the real today
  const lang = await getLang();
  const s = t(lang).home;
  const [data, mine] = await Promise.all([getTodayColors(), myColors()]);
  const today = todayIsoMountain();

  if ("error" in data) {
    return (
      <section className="glass rounded-3xl p-6 sm:p-8">
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
  const matched = mine.filter((k) => todayKeys.has(k));
  const mineNames = mine.map((k) => {
    const i = colorInfo(k, data.colors.find((c) => c.key === k));
    return lang === "es" && i.spanish ? i.spanish : i.english;
  });

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-sm font-medium text-fg-muted">
            {data.date ? cap(longDateMountain(data.date, lang)) : s.today}
          </p>
          <h1 className="mt-1 text-4xl font-bold sm:text-5xl">
            {matched.length ? s.yoursUp : n === 0 ? s.noColors : n === 1 ? s.oneColor : s.nColors(n)}
          </h1>
          {mine.length > 0 && matched.length === 0 && n > 0 && (
            <p className="mt-2 text-sm text-fg-muted">{s.notYours(mineNames.join(", "))}</p>
          )}
        </div>
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
          </span>
          {s.live(fetched)}
        </p>
      </div>

      {stale && <p className="glass mt-4 rounded-2xl px-4 py-3 text-sm text-fg">{s.stale(data.dateText)}</p>}

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
            const isMine = mine.includes(c.key);
            const dimmed = matched.length > 0 && !isMine;
            return (
              <div
                key={c.raw}
                className={`gloss tile-in relative flex flex-col justify-end overflow-hidden transition sm:min-h-56 sm:rounded-[28px] sm:p-7 ${
                  compact ? "min-h-28 rounded-3xl p-4" : "min-h-44 rounded-[28px] p-6"
                } ${wide ? "col-span-2 sm:col-span-1" : ""} ${dimmed ? "opacity-60 saturate-75" : ""} ${
                  isMine ? "ring-2 ring-white ring-offset-4 ring-offset-ink" : ""
                }`}
                style={{
                  background: `linear-gradient(160deg, ${hex} 0%, ${hex} 55%, color-mix(in oklab, ${hex} 70%, black) 100%)`,
                  color: info.text,
                  boxShadow: isMine
                    ? `0 40px 110px -20px ${hex}, 0 0 0 1px rgba(255,255,255,0.3) inset`
                    : `0 30px 80px -30px ${hex}, 0 0 0 1px rgba(255,255,255,0.12) inset`,
                }}
              >
                {isMine && (
                  <span
                    className={`absolute rounded-full bg-white font-bold text-ink shadow sm:right-4 sm:top-4 sm:px-3 sm:py-1 sm:text-xs ${
                      compact ? "right-2.5 top-2.5 px-2 py-0.5 text-[11px]" : "right-4 top-4 px-3 py-1 text-xs"
                    }`}
                  >
                    {s.yourColor}
                  </span>
                )}
                <span
                  className={`display relative break-words font-extrabold leading-none ${
                    primary.length > 9
                      ? `${compact ? "text-xl" : "text-3xl"} sm:text-4xl`
                      : primary.length > 6
                        ? `${compact ? "text-2xl" : "text-4xl"} sm:text-5xl`
                        : `${compact ? "text-3xl" : "text-5xl"} sm:text-6xl`
                  }`}
                  style={{ textShadow: "0 2px 16px rgba(0,0,0,0.18)" }}
                >
                  {cap(primary)}
                </span>
                {secondary && (
                  <span
                    className={`relative font-semibold opacity-80 sm:mt-2 sm:text-lg ${compact ? "mt-1 text-sm" : "mt-2 text-lg"}`}
                  >
                    {secondary}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data.announcement && (
        <div className="glass mt-4 flex gap-3 rounded-2xl px-4 py-3 text-sm">
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
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
        <div className="min-h-44 rounded-[28px] bg-white/8 sm:min-h-56" />
        <div className="min-h-44 rounded-[28px] bg-white/8 sm:min-h-56" />
      </div>
    </section>
  );
}
