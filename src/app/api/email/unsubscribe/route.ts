import type { NextRequest } from "next/server";
import { log, who } from "@/lib/log";
import { accountForEmailLink, clearEmail, deleteSubscriber } from "@/lib/dynamo";
import { deleteAlerts } from "@/lib/alertlog";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { ready } from "@/lib/config";

/**
 * /api/email/unsubscribe?p=<account>&t=<token>: the link in every alert email.
 *
 * GET changes nothing; it sends the person to the /stop-emails page, which has the button. Mail scanners
 * open every link in a message, and if opening it were enough, a scanner could silently switch off
 * someone's alerts. The emails stop on POST: the button on that page, or the RFC 8058 one-click request
 * a mail app sends when the person presses its own "unsubscribe".
 *
 * Stops emails only; texts and device notifications continue. The page's second button posts all=1,
 * which ends every alert and deletes the account, the same as "Stop alerts" on the Alerts page.
 */
function read(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  return { p, t, ok: verifyUnsubscribe(p, t) };
}

/** A redirect to the page, relative so it works on any host the site is served from. */
function toPage(p: string, t: string, done?: string) {
  const q = new URLSearchParams({ p, t });
  if (done) q.set("done", done);
  return new Response(null, { status: 303, headers: { location: `/stop-emails?${q}`, "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  await ready();
  const { p, t } = read(req);
  return toPage(p, t);
}

export async function POST(req: NextRequest) {
  await ready();
  const { p, t, ok } = read(req);
  const form = await req.formData().catch(() => null);
  // A mail app's own unsubscribe button posts this field and never shows the response.
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  if (!ok) {
    log.warn("unsubscribe_link_refused", { oneClick });
    return oneClick ? new Response("invalid link", { status: 400 }) : toPage(p, t);
  }
  // Usually the alert the link names; the combined one if that alert was folded into another since.
  const id = (await accountForEmailLink(p))?.phone ?? p;
  if (form?.get("all") === "1" && !oneClick) {
    await Promise.all([deleteSubscriber(id), deleteAlerts(id)]);
    log.info("alerts_ended", { who: who(id), via: "email link" });
    return toPage(p, t, "all");
  }
  await clearEmail(id, "unsubscribe");
  log.info("emails_stopped", { who: who(id), oneClick });
  return oneClick ? new Response("ok", { headers: { "cache-control": "no-store" } }) : toPage(p, t, "1");
}
