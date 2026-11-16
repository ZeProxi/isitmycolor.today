import { getTodayColors } from "@/lib/today";
import { todayIsoMountain } from "@/lib/dates";

/** GET /api/colors -> today's colors straight from the hotline page. */
export async function GET() {
  const snapshot = await getTodayColors(); // held for a minute; one visitor burst = one fetch of wasatch.org
  if ("error" in snapshot) return Response.json({ error: snapshot.error }, { status: 502 });
  const isForToday = snapshot.date === todayIsoMountain();
  return Response.json(
    { ...snapshot, today: todayIsoMountain(), isForToday },
    // Never let the CDN or a browser hold on to another day's colors.
    { headers: { "cache-control": isForToday ? "public, max-age=30, s-maxage=30" : "no-store" } },
  );
}
