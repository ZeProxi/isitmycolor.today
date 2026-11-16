import { KNOWN_COLORS, colorInfo } from "@/lib/colors";
import { getKnownColorKeys } from "@/lib/dynamo";
import { withSeenColors } from "@/lib/seen-colors";

/** GET /api/known-colors -> the static list merged with every color we've seen on the site. */
export async function GET() {
  let seen: string[] = [];
  try {
    await withSeenColors();
    seen = await getKnownColorKeys();
  } catch {
    // table may not exist yet in dev; fall back to the static list
  }
  const keys = new Set([...KNOWN_COLORS.map((c) => c.key), ...seen]);
  return Response.json({ colors: Array.from(keys).map((k) => colorInfo(k)) }, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
