import { connection } from "next/server";
import { fetchColors, type ColorsSnapshot } from "./scrape";
import { todayIsoMountain } from "./dates";
import { log, reason } from "./log";

export type TodayResult = Omit<ColorsSnapshot, "rawHtml"> | { error: string };

/** How long a snapshot dated today is served before wasatch.org is asked again. */
const FRESH_MS = 60_000;
/** How long an error, or a snapshot still showing another day, is held before retrying. */
const RETRY_MS = 10_000;

let memo: { value: TodayResult; at: number } | null = null;
let inflight: Promise<TodayResult> | null = null;

function usable(m: { value: TodayResult; at: number }, now: number): boolean {
  const age = now - m.at;
  if ("error" in m.value) return age < RETRY_MS;
  // A copy from before midnight must not outlive midnight: once the Mountain date
  // moves on, anything dated otherwise is re-checked almost immediately.
  if (m.value.date !== todayIsoMountain(new Date(now))) return age < RETRY_MS;
  return age < FRESH_MS;
}

async function load(): Promise<TodayResult> {
  try {
    const { rawHtml: _html, ...snapshot } = await fetchColors();
    console.log(
      `[colors] fetched date=${snapshot.date ?? "none"} colors=${snapshot.colors.map((c) => c.key).join(",") || "none"}`,
    );
    return snapshot;
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not reach wasatch.org";
    log.warn("colors_fetch_failed", { err: reason(e) });
    return { error };
  }
}

/**
 * Today's colors from the hotline page. Shared by the page, the ambient backdrop
 * and /api/colors.
 *
 * Held in this server instance's memory for a minute so a burst of visitors
 * doesn't hammer wasatch.org. This deliberately isn't `"use cache"`: that serves
 * the old value while it refreshes in the background and keeps it for up to an
 * hour, and every serverless instance has its own copy, so after midnight
 * visitors bounced between instances showing yesterday and today.
 */
export async function getTodayColors(): Promise<TodayResult> {
  await connection(); // request time only; never baked into a prerender
  const now = Date.now();
  if (memo && usable(memo, now)) return memo.value;
  inflight ??= load()
    .then((value) => {
      memo = { value, at: Date.now() };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
