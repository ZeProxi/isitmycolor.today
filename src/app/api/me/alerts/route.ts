import type { NextRequest } from "next/server";
import { currentAccount } from "@/lib/auth";
import { listAlerts } from "@/lib/alertlog";

const PAGE = 10;

/**
 * GET -> one page of the signed-in person's alert history, newest first.
 * ?before=<ISO time of the last entry shown> returns the next older page.
 * Session cookie required.
 */
export async function GET(req: NextRequest) {
  const id = await currentAccount();
  if (!id) return Response.json({ error: "unauthorized" }, { status: 401 });
  const before = req.nextUrl.searchParams.get("before") ?? undefined;
  if (before && Number.isNaN(Date.parse(before))) return Response.json({ error: "invalid_before" }, { status: 400 });
  return Response.json(await listAlerts(id, PAGE, before), { headers: { "cache-control": "private, no-store" } });
}
