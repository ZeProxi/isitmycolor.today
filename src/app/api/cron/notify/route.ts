import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { runNotify } from "@/lib/notify";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";
import { clientIp } from "@/lib/ratelimit";

/**
 * POST /api/cron/notify   (also GET)
 * Header: Authorization: Bearer <CRON_SECRET>
 * Optional ?force=1 to re-send even if already notified today (testing only).
 *
 * This is what the scheduler calls every morning. It scrapes the hotline page,
 * stores the snapshot, and alerts subscribers whose colors came up.
 *
 * The secret is accepted in the header only. A secret in the address would end
 * up in access logs and browser history.
 *
 * ?diag=1 (same secret) runs nothing and reports how this request reached the
 * server, which is how the "which forwarded address is the visitor's" rule in
 * ratelimit.ts is checked against the real hosting setup.
 */
function authorized(req: NextRequest): boolean {
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const secret = env.cronSecret;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  await ready();
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (req.nextUrl.searchParams.get("diag") === "1") {
    const pick = ["x-forwarded-for", "x-real-ip", "forwarded", "via", "cloudfront-viewer-address", "x-forwarded-host", "x-forwarded-proto"];
    return Response.json({ resolved: clientIp(req), headers: Object.fromEntries(pick.map((h) => [h, req.headers.get(h)])) });
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
