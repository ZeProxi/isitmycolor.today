import { connection } from "next/server";
import { HOTLINE_PHONE, LOCATIONS, fmtHour, fmtRanges, destination, openStatus } from "@/lib/locations";
import { DirectionsButtons } from "./DirectionsButtons";
import { mountainClock } from "@/lib/dates";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";

export async function Locations() {
  await connection();
  const s = t(await getLang()).where;
  const { weekday, hour } = mountainClock();

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">{s.title}</h2>
        <a
          className="text-sm text-fg-muted underline decoration-fg-faint underline-offset-4 hover:text-fg"
          href={`tel:${HOTLINE_PHONE.replace(/\D/g, "")}`}
        >
          {s.hotline} {HOTLINE_PHONE}
        </a>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {LOCATIONS.map((loc) => {
          const st = openStatus(loc, weekday, hour);
          const pill =
            st.state === "open"
              ? { text: s.openUntil(fmtHour(st.until)), cls: "bg-ok/15 text-ok ring-ok/30" }
              : st.state === "break"
                ? { text: s.lunch(fmtHour(st.until)), cls: "bg-amber-400/15 text-amber-300 ring-amber-300/30" }
                : {
                    text: st.opensAt
                      ? s.closedOpens(
                          st.nextDay ? `${st.nextDay === "tomorrow" ? s.tomorrow : s.days[st.nextDayIndex ?? 0]} ` : "",
                          fmtHour(st.opensAt),
                        )
                      : s.closed,
                    cls: "bg-white/6 text-fg-muted ring-white/10",
                  };
          const note = loc.weekend.length ? s.jkNote : s.clinicNote;
          return (
            <article key={loc.name} className="glass flex flex-col rounded-3xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold leading-tight">{loc.name}</h3>
                  <p className="text-sm text-fg-muted">{loc.short}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${pill.cls}`}>
                  {pill.text}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-fg-faint">{s.monFri}</dt>
                <dd>{fmtRanges(loc.weekday, s.closed)}</dd>
                <dt className="text-fg-faint">{s.satSun}</dt>
                <dd>{fmtRanges(loc.weekend, s.closed)}</dd>
              </dl>

              <p className="mt-3 text-sm text-fg-muted">{loc.address.join(", ")}</p>
              <p className="mt-1 text-xs text-fg-faint">{note}</p>

              <DirectionsButtons destination={destination(loc)} googleLabel={s.google} appleLabel={s.apple} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
