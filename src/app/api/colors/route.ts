import { fetchColors } from "@/lib/scrape";
import { todayIsoMountain } from "@/lib/dates";

/** GET /api/colors -> today's colors straight from the hotline page. */
export async function GET() {
  try {
    const { rawHtml: _html, ...snapshot } = await fetchColors();
    return Response.json(
      { ...snapshot, today: todayIsoMountain(), isForToday: snapshot.date === todayIsoMountain() },
      { headers: { "cache-control": "public, max-age=60" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to fetch colors" },
      { status: 502 },
    );
  }
}
