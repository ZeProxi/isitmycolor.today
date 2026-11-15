import type { NextRequest } from "next/server";
import { getDayRecord, listMonthSnapshots, listRecentSnapshots } from "@/lib/dynamo";

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
      return Response.json({ day: rec });
    }
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "Bad month" }, { status: 400 });
      return Response.json({ month, days: await listMonthSnapshots(month) });
    }
    return Response.json({ days: await listRecentSnapshots(30) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
