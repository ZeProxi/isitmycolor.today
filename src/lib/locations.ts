/** Testing locations, transcribed from the printed handout. Verify with the hotline before relying on them. */
export type Range = [open: number, close: number]; // hours, decimal (16.5 = 4:30 pm)
export type Location = {
  name: string;
  short: string;
  address: string[];
  /** Mon-Fri windows */
  weekday: Range[];
  /** Sat/Sun windows (holidays follow weekend hours on the handout, but we can't know holidays) */
  weekend: Range[];
};

export const HOTLINE_PHONE = "(385) 268-5002";
export const HOTLINE_URL = "https://wasatch.org/colors/";

export const LOCATIONS: Location[] = [
  {
    name: "JK Building",
    short: "Orem",
    address: ["255 S Orem Blvd", "Orem, UT 84057"],
    weekday: [[8, 18]],
    weekend: [[9, 12]],
  },
  {
    name: "American Fork Family Clinic",
    short: "American Fork",
    address: ["578 E 300 S Cir", "American Fork, UT 84003"],
    weekday: [[8, 12], [12.5, 16.5]],
    weekend: [],
  },
  {
    name: "Westpark Family Clinic",
    short: "Provo",
    address: ["750 N Freedom Blvd", "Provo, UT 84601"],
    weekday: [[8, 12], [12.5, 16.5]],
    weekend: [],
  },
  {
    name: "Payson Family Clinic",
    short: "Payson",
    address: ["285 N 1250 E St", "Payson, UT 84651"],
    weekday: [[8, 12], [12.5, 16.5]],
    weekend: [],
  },
];

/** Destination for directions links: street address only. Adding the building name makes Google geocode the wrong spot. */
export function destination(loc: Location) {
  return loc.address.join(", ");
}

export function fmtHour(h: number): string {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  const ampm = whole >= 12 ? "pm" : "am";
  const hh = ((whole + 11) % 12) + 1;
  return mins ? `${hh}:${String(mins).padStart(2, "0")} ${ampm}` : `${hh} ${ampm}`;
}

export function fmtRanges(r: Range[], closedLabel = "Closed"): string {
  if (r.length === 0) return closedLabel;
  return r.map(([a, b]) => `${fmtHour(a)} – ${fmtHour(b)}`).join(", ");
}

export type OpenStatus =
  | { state: "open"; until: number }
  | { state: "break"; until: number }
  | { state: "closed"; opensAt?: number; nextDay?: "tomorrow" | "weekday"; nextDayIndex?: number };

/** Open / closed right now, given the Mountain-time weekday (0=Sun) and decimal hour. */
export function openStatus(loc: Location, weekday: number, hour: number): OpenStatus {
  const isWeekend = weekday === 0 || weekday === 6;
  const today = isWeekend ? loc.weekend : loc.weekday;
  for (let i = 0; i < today.length; i++) {
    const [a, b] = today[i];
    if (hour >= a && hour < b) return { state: "open", until: b };
    const next = today[i + 1];
    if (next && hour >= b && hour < next[0]) return { state: "break", until: next[0] };
  }
  const later = today.find(([a]) => hour < a);
  if (later) return { state: "closed", opensAt: later[0] };
  // find next day with hours
  for (let d = 1; d <= 7; d++) {
    const wd = (weekday + d) % 7;
    const ranges = wd === 0 || wd === 6 ? loc.weekend : loc.weekday;
    if (ranges.length) {
      return { state: "closed", opensAt: ranges[0][0], nextDay: d === 1 ? "tomorrow" : "weekday", nextDayIndex: wd };
    }
  }
  return { state: "closed" };
}
