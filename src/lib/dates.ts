import { env } from "./env";

/** Today's date in Mountain time as YYYY-MM-DD. */
export function todayIsoMountain(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: env.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Converts the site's MM/DD/YYYY into YYYY-MM-DD. Returns null if unparseable. */
export function usDateToIso(us: string): string | null {
  const m = us.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Current hour (0-23) in Mountain time. */
export function hourMountain(now = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: env.timeZone, hour: "numeric", hour12: false }).format(now);
  return Number(h) % 24;
}

/** "YYYY-MM" for a date string or today. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Mountain-time weekday (0 = Sunday) and decimal hour (13.5 = 1:30 pm). */
export function mountainClock(now = new Date()): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: env.timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = (Number(get("hour")) % 24) + Number(get("minute")) / 60;
  return { weekday, hour };
}

/** "Sunday, November 15" in Mountain time. */
export function longDateMountain(iso: string, lang: "en" | "es" = "en"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
