import * as cheerio from "cheerio";
import { env } from "./env";
import { usDateToIso } from "./dates";
import { normalizeColorKey, KNOWN_COLORS } from "./colors";

export type ScrapedColor = {
  /** lowercase English key, e.g. "green" */
  key: string;
  /** raw text from the site, e.g. "green/verde" */
  raw: string;
  english: string;
  spanish: string;
  /** CSS background color the site used, e.g. "Green" */
  siteBackground: string | null;
};

export type ColorsSnapshot = {
  /** ISO YYYY-MM-DD parsed from the page, or null if the page had no date */
  date: string | null;
  /** Date as printed on the site, e.g. "11/15/2026" */
  dateText: string;
  /** Day name as printed, e.g. "Sunday" */
  dayName: string;
  /** Hotline announcement banner text, if any */
  announcement: string;
  colors: ScrapedColor[];
  sourceUrl: string;
  fetchedAt: string;
  /** The page HTML as fetched. Stored in the history table as evidence; stripped from API responses. */
  rawHtml?: string;
  /**
   * "expected": read from the page structure this was written for. "fallback": that structure was
   * missing and the colors or date were recognized by appearance instead, so the list may be incomplete.
   */
  layout?: "expected" | "fallback";
};

/**
 * Parse the hotline page HTML. As of November 2026 the page is a tiny ASP.NET form:
 *   <span id="Label4">announcement</span>
 *   <span id="Label2">Sunday</span><span id="Label3"> 11/15/2026</span>
 *   <div id="Panel1"><input type="text" value="green/verde" style="background-color:Green" />...</div>
 *
 * That exact structure is read first. If it isn't there (the page was rebuilt,
 * ids renamed), the same information is looked for by what it looks like rather
 * than where it sits, and the snapshot is marked `layout: "fallback"`.
 *
 * A fallback reading is trusted for what it finds, not for what it doesn't: a
 * color it found really is on the page, but it may have missed others. The
 * daily job treats it accordingly (see runNotify) and the owner is told.
 */
export function parseColorsHtml(html: string, sourceUrl = env.sourceUrl): ColorsSnapshot {
  const $ = cheerio.load(html);
  let layout: "expected" | "fallback" = "expected";

  const announcement = $("#Label4").text().trim();

  // ---- colors: the known panel first
  const colors: ScrapedColor[] = [];
  const add = (raw: string, style: string | undefined) => {
    const [en, es = ""] = raw.split("/").map((s) => s.trim());
    const key = normalizeColorKey(en);
    if (!key || colors.some((c) => c.key === key)) return;
    const bg = (style ?? "").match(/background(?:-color)?:\s*([^;]+)/i)?.[1]?.trim() ?? null;
    colors.push({ key, raw, english: en, spanish: es, siteBackground: bg });
  };
  // Only the visible text boxes are colors. A hidden field or a button that the page might one day
  // put inside the panel must never turn into a "color".
  $("#Panel1 input").each((_, el) => {
    const type = ($(el).attr("type") ?? "text").toLowerCase();
    const raw = ($(el).attr("value") ?? "").trim();
    if (type === "text" && raw) add(raw, $(el).attr("style"));
  });

  if (colors.length === 0) {
    // ---- the panel is gone or empty: look for things that look like the color boxes, anywhere on the page.
    // A candidate is a short piece of text that is either "english/spanish" or the name of a color we know.
    const looksLikeColor = (raw: string) => {
      if (!raw || raw.length > 40) return false;
      if (/^[a-z\u00c0-\u017f ]+\/[a-z\u00c0-\u017f ]+$/i.test(raw)) return true;
      return COLOR_WORDS.has(normalizeColorKey(raw.split("/")[0]));
    };
    // 1. text boxes anywhere
    $("input").each((_, el) => {
      const type = ($(el).attr("type") ?? "text").toLowerCase();
      const raw = ($(el).attr("value") ?? "").trim();
      if (type === "text" && looksLikeColor(raw)) add(raw, $(el).attr("style"));
    });
    // 2. anything given its own background color (how the page has always shown a color), holding only that text
    $('[style*="background"]').each((_, el) => {
      if ($(el).children().length > 0) return;
      const raw = $(el).text().trim();
      if (looksLikeColor(raw)) add(raw, $(el).attr("style"));
    });
    if (colors.length > 0) layout = "fallback";
  }

  // ---- the date: the known label first, then any full date printed on the page outside the announcement
  let dayName = $("#Label2").text().trim();
  let dateText = $("#Label3").text().trim();
  let date = usDateToIso(dateText);
  if (!date) {
    const $rest = cheerio.load(html);
    $rest("#Label4, script, style").remove();
    const text = $rest("body").text().replace(/\s+/g, " ");
    const found = findDate(text);
    if (found) {
      date = found.iso;
      dateText = found.text;
      dayName = dayName || (text.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i)?.[1] ?? "");
      layout = "fallback";
    }
  }

  return {
    date,
    dateText,
    dayName,
    announcement,
    colors,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    rawHtml: html,
    layout,
  };
}

/** English and Spanish names of every color in the built-in list, normalized, for recognizing a color out of place. */
const COLOR_WORDS = new Set(KNOWN_COLORS.flatMap((c) => [normalizeColorKey(c.english), normalizeColorKey(c.spanish)]).filter(Boolean));

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The first complete date in a run of text: 11/17/2026, 11-17-2026, 2026-11-17, or "November 17, 2026". */
function findDate(text: string): { iso: string; text: string } | null {
  const pad = (n: string | number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2100;
  let m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (m && ok(+m[3], +m[1], +m[2])) return { iso: `${m[3]}-${pad(m[1])}-${pad(m[2])}`, text: m[0] };
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m && ok(+m[1], +m[2], +m[3])) return { iso: `${m[1]}-${m[2]}-${m[3]}`, text: m[0] };
  m = text.match(new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"));
  if (m && ok(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2])) {
    return { iso: `${m[3]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${pad(m[2])}`, text: m[0] };
  }
  return null;
}

/** Fetch the live page and parse it. Throws on network/HTTP failure. */
export async function fetchColors(): Promise<ColorsSnapshot> {
  const res = await fetch(env.sourceUrl, {
    // The ASP.NET page omits its inline background colors for unknown user agents,
    // so identify as a browser; the colors are the whole point.
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 isitmycolor.today",
    },
    cache: "no-store",
    // A stalled connection must fail (and be retried on the next run), not hang the whole job.
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Source returned HTTP ${res.status}`);
  const html = await res.text();
  // A response cut off part-way could be missing colors. Treat it as a failed read, never as "fewer colors today".
  if (!/<\/html>\s*$/i.test(html)) throw new Error("Source returned an incomplete page");
  return parseColorsHtml(html);
}
