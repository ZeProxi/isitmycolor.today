import type { ColorsSnapshot } from "@/lib/scrape";
import { t, type Lang } from "@/lib/i18n";
import { longDateMountain } from "@/lib/dates";

/** The hotline's banner notices for a month, grouped into runs of consecutive days with the same text. */
export function NoticeHistory({ days, lang }: { days: ColorsSnapshot[]; lang: Lang }) {
  const s = t(lang).history;
  const runs: { text: string; from: string; to: string }[] = [];
  for (const d of days) {
    if (!d.date) continue;
    const text = d.announcement.trim();
    if (!text) continue;
    const last = runs[runs.length - 1];
    if (last && last.text === text) last.to = d.date;
    else runs.push({ text, from: d.date, to: d.date });
  }
  if (runs.length === 0) return null;
  return (
    <section>
      <h2 className="text-2xl font-bold">{s.noticesTitle}</h2>
      <ul className="mt-3 space-y-2">
        {runs.map((r) => (
          <li key={r.from} className="glass rounded-2xl px-4 py-3">
            <p className="text-xs text-fg-muted">
              {r.from === r.to ? longDateMountain(r.from, lang) : `${longDateMountain(r.from, lang)} – ${longDateMountain(r.to, lang)}`}
            </p>
            <p className="mt-1 text-sm">{r.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
