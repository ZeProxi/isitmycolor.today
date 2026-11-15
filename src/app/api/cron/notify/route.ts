import type { NextRequest } from "next/server";
import { runNotify } from "@/lib/notify";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";

/**
 * POST /api/cron/notify   (also GET, so EventBridge / a browser can hit it)
 * Header: Authorization: Bearer <CRON_SECRET>   or   ?secret=<CRON_SECRET>
 * Optional ?force=1 to re-send even if already notified today (testing only).
 *
 * This is what the scheduler calls every morning. It scrapes the hotline page,
 * stores the snapshot, and texts subscribers whose colors came up.
 */
async function handle(req: NextRequest) {
  await ready();
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("secret") || "";
  if (!env.cronSecret || provided !== env.cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const result = await runNotify({ force });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
