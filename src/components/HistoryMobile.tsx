"use client";

import { useState } from "react";
import Link from "next/link";

export type MobileDay = {
  /** the long date, e.g. "Tuesday, November 17" */
  label: string;
  colors: { key: string; name: string; hex: string; text: string; mine: boolean }[];
};

/**
 * The month on a phone: a real calendar, each day showing its colors as small
 * stripes, and the day you tap spelled out underneath with a link to its saved
 * page. (Wider screens have room to print the color names in the grid itself.)
 */
export function HistoryMobile({
  cells,
  days,
  today,
  weekdays,
  labels,
}: {
  /** the month laid out in weeks: a date per cell, null for the blanks before the 1st and after the last day */
  cells: (string | null)[];
  days: Record<string, MobileDay>;
  today: string;
  weekdays: readonly string[];
  labels: { none: string; open: string; nothing: string };
}) {
  const recorded = Object.keys(days).sort();
  // Start on today if it's in this month, otherwise on the latest day there is.
  const [picked, setPicked] = useState<string | null>(days[today] ? today : (recorded[recorded.length - 1] ?? null));
  const day = picked ? days[picked] : null;

  return (
    <div className="mt-4 sm:hidden">
      <div className="grid grid-cols-7 text-center text-[11px] text-fg-faint">
        {weekdays.map((w) => (
          <div key={w} className="pb-1.5">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const d = days[date];
          const on = date === picked;
          const base = "flex aspect-square flex-col rounded-md p-1 text-left";
          if (!d) {
            return (
              <div key={date} className={`${base} ${date > today ? "opacity-30" : ""}`}>
                <span className={`text-xs ${date === today ? "font-bold text-accent" : "text-fg-faint"}`}>{Number(date.slice(-2))}</span>
              </div>
            );
          }
          return (
            <button
              key={date}
              type="button"
              aria-pressed={on}
              aria-label={d.label}
              onClick={() => setPicked(date)}
              className={`${base} ${on ? "bg-white/15 ring-2 ring-fg" : "bg-white/5"}`}
            >
              <span className={`text-xs ${date === today ? "font-bold text-accent" : on ? "font-bold text-fg" : "text-fg-muted"}`}>{Number(date.slice(-2))}</span>
              <span className="mt-auto flex w-full flex-col gap-[2px]">
                {d.colors.slice(0, 4).map((c) => (
                  <span key={c.key} className={`h-[5px] rounded-[1px] ${c.mine ? "ring-1 ring-white" : ""}`} style={{ background: c.hex }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {recorded.length === 0 ? (
        <p className="panel mt-4 rounded-md px-4 py-3 text-sm text-fg-muted">{labels.nothing}</p>
      ) : (
        day &&
        picked && (
          <div className="panel mt-4 rounded-lg p-4" aria-live="polite">
            <p className="text-sm font-semibold first-letter:uppercase">{day.label}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {day.colors.length === 0 && <span className="text-sm text-fg-muted">{labels.none}</span>}
              {day.colors.map((c) => (
                <Link
                  key={c.key}
                  href={`/color/${encodeURIComponent(c.key)}`}
                  className={`rounded px-3 py-1.5 text-base font-bold capitalize ${c.mine ? "outline outline-2 outline-offset-2 outline-accent" : ""}`}
                  style={{ background: c.hex, color: c.text }}
                >
                  {c.name}
                </Link>
              ))}
            </div>
            <Link href={`/day/${picked}`} className="btn-ghost mt-4 w-full py-2 text-sm">
              {labels.open}
            </Link>
          </div>
        )
      )}
    </div>
  );
}
