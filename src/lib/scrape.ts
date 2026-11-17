import * as cheerio from "cheerio";
import { env } from "./env";
import { usDateToIso } from "./dates";
import { normalizeColorKey } from "./colors";

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
};

/**
 * Parse the hotline page HTML. The page is a tiny ASP.NET form:
 *   <span id="Label4">announcement</span>
 *   <span id="Label2">Sunday</span><span id="Label3"> 11/15/2026</span>
 *   <div id="Panel1"><input value="green/verde" style="background-color:Green" />...</div>
 */
export function parseColorsHtml(html: string, sourceUrl = env.sourceUrl): ColorsSnapshot {
  const $ = cheerio.load(html);

  const announcement = $("#Label4").text().trim();
  const dayName = $("#Label2").text().trim();
  const dateText = $("#Label3").text().trim();

  const colors: ScrapedColor[] = [];
  // Only the visible text boxes are colors. A hidden field or a button that the page might one day
  // put inside the panel must never turn into a "color".
  $("#Panel1 input").each((_, el) => {
    const type = ($(el).attr("type") ?? "text").toLowerCase();
    if (type !== "text") return;
    const raw = ($(el).attr("value") ?? "").trim();
    if (!raw) return;
    const [en, es = ""] = raw.split("/").map((s) => s.trim());
    const style = $(el).attr("style") ?? "";
    const bg = style.match(/background-color:\s*([^;]+)/i)?.[1]?.trim() ?? null;
    colors.push({
      key: normalizeColorKey(en),
      raw,
      english: en,
      spanish: es,
      siteBackground: bg,
    });
  });

  // Fallback: if the page structure changes, grab any "x/y" looking input values.
  if (colors.length === 0) {
    $("input[type=text]").each((_, el) => {
      const raw = ($(el).attr("value") ?? "").trim();
      if (/^[a-z ]+\/[a-z ]+$/i.test(raw)) {
        const [en, es = ""] = raw.split("/").map((s) => s.trim());
        colors.push({ key: normalizeColorKey(en), raw, english: en, spanish: es, siteBackground: null });
      }
    });
  }

  return {
    date: usDateToIso(dateText),
    dateText,
    dayName,
    announcement,
    colors,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    rawHtml: html,
  };
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
