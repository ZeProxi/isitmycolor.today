import { currentAccount } from "@/lib/auth";
import { claimDailyMoment } from "@/lib/dynamo";
import { todayIsoMountain } from "@/lib/dates";

/**
 * POST -> { play: boolean }. True the first time the signed-in person opens the
 * site on a given day (on any device), so the little "your day / not your day"
 * animation on the Today page plays once per account per day, not on every visit.
 */
export async function POST() {
  const id = await currentAccount();
  if (!id) return Response.json({ play: false }, { status: 401 });
  return Response.json({ play: await claimDailyMoment(id, todayIsoMountain()) }, { headers: { "cache-control": "private, no-store" } });
}
