import type { NextRequest } from "next/server";
import { getDayRecord, listMonthSnapshots, listRecentSnapshots } from "@/lib/dynamo";
import { log, reason } from "@/lib/log";

/**
 * GET /api/history?month=YYYY-MM   -> every recorded day in that month
 * GET /api/history?date=YYYY-MM-DD -> one day, including the raw HTML we saved
 * GET /api/history                 -> the 30 most recent days
 */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  const date = req.nextUrl.searchParams.get("date");
  try {
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Bad date" }, { status: 400 });
      const rec = await getDayRecord(date);
      return Response.json({ day: rec }, { headers: { "cache-control": "public, max-age=300, s-maxage=3600" } });
    }
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "Bad month" }, { status: 400 });
      return Response.json({ month, days: await listMonthSnapshots(month) }, { headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
    }
    return Response.json({ days: await listRecentSnapshots(30) }, { headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
  } catch (e) {
    log.error("history_failed", { err: reason(e) });
    return Response.json({ error: "Couldn't load history" }, { status: 500 });
  }
}
