import { getTodayColors } from "@/lib/today";
import { todayIsoMountain } from "@/lib/dates";

/** GET /api/colors -> today's colors straight from the hotline page. */
export async function GET() {
  const snapshot = await getTodayColors(); // cached for a few minutes; one visitor burst = one fetch of wasatch.org
  if ("error" in snapshot) return Response.json({ error: snapshot.error }, { status: 502 });
  return Response.json(
    { ...snapshot, today: todayIsoMountain(), isForToday: snapshot.date === todayIsoMountain() },
    { headers: { "cache-control": "public, max-age=60, s-maxage=120" } },
  );
}
