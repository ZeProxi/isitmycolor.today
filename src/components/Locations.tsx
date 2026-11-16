import { connection } from "next/server";
import { HOTLINE_PHONE, LOCATIONS, fmtHour, fmtRanges, destination, openStatus } from "@/lib/locations";
import { DirectionsButtons } from "./DirectionsButtons";
import { mountainClock } from "@/lib/dates";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";

function fmtLeft(hours: number, lang: "en" | "es"): string {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return lang === "es" ? `${h} h ${m} min` : `${h} h ${m} min`;
}

/** "8 am – 12 pm, 12:30 pm – 4:30 pm" that only ever wraps between ranges, never inside one. */
function Ranges({ text }: { text: string }) {
  const parts = text.split(", ");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className="inline-block whitespace-nowrap">
          {p}
          {i < parts.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}

export async function Locations() {
  await connection();
  const lang = await getLang();
  const s = t(lang).where;
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
              ? { text: s.closesIn(fmtHour(st.until), fmtLeft(st.until - hour, lang)), cls: "bg-ok/15 text-ok ring-ok/30" }
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
              {/* The status pill sits beside the name when there's room and drops under it
                  when there isn't, so it never squeezes the name or pokes out of the card. */}
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold leading-tight">{loc.name}</h3>
                  <p className="text-sm text-fg-muted">{loc.short}</p>
                </div>
                <span className={`max-w-full rounded-2xl px-2.5 py-1 text-xs font-medium ring-1 ${pill.cls}`}>
                  {pill.text}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-fg-faint">{s.monFri}</dt>
                <dd>
                  <Ranges text={fmtRanges(loc.weekday, s.closed)} />
                </dd>
                <dt className="text-fg-faint">{s.satSun}</dt>
                <dd>
                  <Ranges text={fmtRanges(loc.weekend, s.closed)} />
                </dd>
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
