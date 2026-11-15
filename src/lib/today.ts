import { cacheLife } from "next/cache";
import { fetchColors, type ColorsSnapshot } from "./scrape";

export type TodayResult = Omit<ColorsSnapshot, "rawHtml"> | { error: string };

/**
 * Today's colors from the hotline page, cached for a few minutes so a burst of
 * visitors doesn't hammer wasatch.org. Shared by the page and the ambient backdrop.
 */
export async function getTodayColors(): Promise<TodayResult> {
  "use cache";
  cacheLife("minutes");
  try {
    const { rawHtml: _html, ...snapshot } = await fetchColors();
    return snapshot;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reach wasatch.org" };
  }
}
