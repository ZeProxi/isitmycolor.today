import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, type DayRecord } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";
import { colorInfo } from "./colors";
import type { ColorsSnapshot } from "./scrape";

export type ColorStat = {
  key: string;
  english: string;
  spanish: string;
  hex: string;
  /** days this color was listed */
  count: number;
  /** share of recorded days (0-1) */
  shareOfDays: number;
  lastDate: string | null;
  daysSinceLast: number | null;
  /** mean days between appearances, when it appeared 2+ times */
  avgGap: number | null;
  /** count per weekday, 0 = Sunday */
  byWeekday: number[];
  /** longest run of recorded days without this color */
  longestGap: number | null;
  /** share of days in the last 30 recorded days */
  recentShare: number | null;
  /** of the days this color was listed, how often it was listed again the very next recorded day */
  repeatNextDay: { times: number; of: number } | null;
};

export type Pair = { a: string; b: string; together: number; expected: number };

export type DayStat = {
  date: string;
  weekday: number;
  colors: string[];
  /** hotline counter ids found in the saved page, e.g. [3802, 3803] */
  ids: number[];
  announcement: boolean;
};

export type Analytics = {
  daysRecorded: number;
  firstDate: string | null;
  lastDate: string | null;
  totalCalls: number;
  avgPerDay: number;
  /** how many days had N colors: index = N */
  perDayHistogram: number[];
  colors: ColorStat[];
  byWeekday: { weekday: number; days: number; calls: number }[];
  days: DayStat[];
  /** hotline counter: lowest and highest id seen, and implied entries per day across the span */
  counter: { min: number; max: number; firstDate: string; lastDate: string; impliedPerDay: number } | null;
  /** pairs of colors that appeared on the same day, with how often chance alone would put them together */
  pairs: Pair[];
  /** how often any color repeats from one recorded day to the next, vs what chance would give */
  repeat: { observed: number; expected: number; days: number } | null;
};

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

async function loadAllDays(withHtml: boolean): Promise<DayRecord[]> {
  await ready();
  const out: DayRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await docClient().send(
      new QueryCommand({
        TableName: env.historyTable,
        KeyConditionExpression: "pk = :p",
        ExpressionAttributeValues: { ":p": "DAY" },
        // the saved page HTML is only needed for the hotline counter; skip it when the caller doesn't want that
        ExpressionAttributeNames: withHtml ? { "#s": "snapshot", "#h": "rawHtml" } : { "#s": "snapshot" },
        ProjectionExpression: withHtml ? "sk, #s, #h" : "sk, #s",
        ScanIndexForward: true,
        ExclusiveStartKey,
      }),
    );
    out.push(...((r.Items as DayRecord[]) ?? []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

export function computeAnalytics(records: { sk: string; snapshot: ColorsSnapshot; rawHtml?: string }[], today: string): Analytics {
  const days: DayStat[] = records
    .filter((r) => r.snapshot?.date)
    .map((r) => ({
      date: r.sk,
      weekday: weekdayOf(r.sk),
      colors: r.snapshot.colors.map((c) => c.key),
      ids: Array.from((r.rawHtml ?? "").matchAll(/name="a(\d+)"/g), (m) => Number(m[1])),
      announcement: !!r.snapshot.announcement,
    }));

  const perColor = new Map<string, { dates: string[]; byWeekday: number[] }>();
  for (const d of days) {
    for (const k of d.colors) {
      const e = perColor.get(k) ?? { dates: [], byWeekday: [0, 0, 0, 0, 0, 0, 0] };
      e.dates.push(d.date);
      e.byWeekday[d.weekday]++;
      perColor.set(k, e);
    }
  }

  const recentDays = days.slice(-30);
  const dateIndex = new Map(days.map((d, i) => [d.date, i]));

  const colors: ColorStat[] = Array.from(perColor.entries())
    .map(([key, e]) => {
      const info = colorInfo(key);
      const gaps = e.dates.slice(1).map((d, i) => daysBetween(e.dates[i], d));
      const last = e.dates[e.dates.length - 1];
      // gaps measured in recorded days (index distance), so missing scrape days don't inflate them
      const idx = e.dates.map((d) => dateIndex.get(d) ?? 0);
      const runGaps = [idx[0], ...idx.slice(1).map((v, i) => v - idx[i] - 1), days.length - 1 - idx[idx.length - 1]];
      let repeatTimes = 0;
      let repeatOf = 0;
      for (const i of idx) {
        if (i + 1 < days.length) {
          repeatOf++;
          if (days[i + 1].colors.includes(key)) repeatTimes++;
        }
      }
      return {
        longestGap: days.length > 1 ? Math.max(...runGaps) : null,
        recentShare: recentDays.length >= 7 ? recentDays.filter((d) => d.colors.includes(key)).length / recentDays.length : null,
        repeatNextDay: repeatOf ? { times: repeatTimes, of: repeatOf } : null,
        key,
        english: info.english,
        spanish: info.spanish,
        hex: info.hex,
        count: e.dates.length,
        shareOfDays: days.length ? e.dates.length / days.length : 0,
        lastDate: last,
        daysSinceLast: daysBetween(last, today),
        avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
        byWeekday: e.byWeekday,
      };
    })
    .sort((a, b) => b.count - a.count || a.english.localeCompare(b.english));

  const perDayHistogram: number[] = [];
  for (const d of days) perDayHistogram[d.colors.length] = (perDayHistogram[d.colors.length] ?? 0) + 1;
  for (let i = 0; i < perDayHistogram.length; i++) perDayHistogram[i] ??= 0;

  const byWeekday = Array.from({ length: 7 }, (_, w) => ({
    weekday: w,
    days: days.filter((d) => d.weekday === w).length,
    calls: days.filter((d) => d.weekday === w).reduce((n, d) => n + d.colors.length, 0),
  }));

  const withIds = days.filter((d) => d.ids.length);
  let counter: Analytics["counter"] = null;
  if (withIds.length) {
    const first = withIds[0];
    const last = withIds[withIds.length - 1];
    const min = Math.min(...first.ids);
    const max = Math.max(...last.ids);
    const span = Math.max(1, daysBetween(first.date, last.date));
    counter = { min, max, firstDate: first.date, lastDate: last.date, impliedPerDay: withIds.length > 1 ? (max - min + 1) / (span + 1) : first.ids.length };
  }

  const totalCalls = days.reduce((n, d) => n + d.colors.length, 0);

  // Co-occurrence: observed vs expected-by-chance (independent draws with each color's own daily rate).
  const pairs: Pair[] = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const a = colors[i];
      const b = colors[j];
      const together = days.filter((d) => d.colors.includes(a.key) && d.colors.includes(b.key)).length;
      const expected = days.length ? (a.count * b.count) / days.length : 0;
      if (together > 0 || expected >= 1) pairs.push({ a: a.key, b: b.key, together, expected });
    }
  }
  pairs.sort((x, y) => y.together - x.together || y.expected - x.expected);

  // Day-to-day repeat: how often a day shares at least one color with the previous recorded day.
  let repeat: Analytics["repeat"] = null;
  if (days.length >= 2) {
    let observed = 0;
    let expected = 0;
    for (let i = 1; i < days.length; i++) {
      if (days[i].colors.some((k) => days[i - 1].colors.includes(k))) observed++;
      // chance that at least one of yesterday's colors is drawn again today, given each color's daily rate
      const pNone = days[i - 1].colors.reduce((acc, k) => acc * (1 - (perColor.get(k)?.dates.length ?? 0) / days.length), 1);
      expected += 1 - pNone;
    }
    repeat = { observed, expected, days: days.length - 1 };
  }

  return {
    pairs: pairs.slice(0, 12),
    repeat,
    daysRecorded: days.length,
    firstDate: days[0]?.date ?? null,
    lastDate: days[days.length - 1]?.date ?? null,
    totalCalls,
    avgPerDay: days.length ? totalCalls / days.length : 0,
    perDayHistogram,
    colors,
    byWeekday,
    days: days.slice().reverse(),
    counter,
  };
}

export async function getAnalytics(today: string, opts: { withHtml?: boolean } = {}): Promise<Analytics> {
  return computeAnalytics(await loadAllDays(opts.withHtml ?? true), today);
}
