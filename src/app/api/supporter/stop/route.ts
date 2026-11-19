import type { NextRequest } from "next/server";
import { removeSupporter, resolveSupporterLink } from "@/lib/supporters";
import { ready } from "@/lib/config";

/**
 * /api/supporter/stop?p=<account>&e=<email>&t=<token>: the "stop these emails" link in
 * every alert a support person gets. GET sends the browser to the page that asks first; POST
 * removes them. A mail app's own "unsubscribe" button posts here directly and never shows the
 * answer, so that case gets a plain reply.
 */
function toPage(req: NextRequest, done = false) {
  const from = req.nextUrl.searchParams;
  const q = new URLSearchParams({ a: "stop", p: from.get("p") ?? "", e: from.get("e") ?? "", t: from.get("t") ?? "" });
  if (done) q.set("done", "1");
  return new Response(null, { status: 303, headers: { location: `/supporter?${q}`, "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  return toPage(req);
}

export async function POST(req: NextRequest) {
  await ready();
  const q = req.nextUrl.searchParams;
  const e = (q.get("e") ?? "").toLowerCase();
  const p = await resolveSupporterLink("stop", q.get("p") ?? "", e, q.get("t") ?? "");
  const form = await req.formData().catch(() => null);
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  if (!p) return oneClick ? new Response("invalid link", { status: 400 }) : toPage(req);
  await removeSupporter(p, e);
  return oneClick ? new Response("ok", { headers: { "cache-control": "no-store" } }) : toPage(req, true);
}
