import { cacheLife } from "next/cache";
import { getSeenColors } from "./dynamo";
import { registerColors, type ColorInfo } from "./colors";

/** Colors learned from the hotline page, cached so pages don't query per request. */
export async function loadSeenColors(): Promise<ColorInfo[]> {
  "use cache";
  cacheLife("minutes");
  try {
    return await getSeenColors();
  } catch {
    return []; // table missing in a fresh dev setup: the built-in list still works
  }
}

/** Make colorInfo() aware of learned colors for the rest of this render. */
export async function withSeenColors(): Promise<ColorInfo[]> {
  const list = await loadSeenColors();
  registerColors(list);
  return list;
}
