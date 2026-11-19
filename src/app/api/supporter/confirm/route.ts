import type { NextRequest } from "next/server";
import { confirmSupporter, resolveSupporterLink, stopUrl, textUrl } from "@/lib/supporters";
import { ready } from "@/lib/config";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { supporterWelcomeEmail } from "@/lib/email-layout";
import { allowNonAlertEmail } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";
import { log, reason, who } from "@/lib/log";

/**
 * /api/supporter/confirm?p=<account>&e=<email>&t=<token>: the link in an invitation.
 * GET sends the browser to the page that asks; alerts start when its button is pressed
 * (a POST here), so a mail scanner that opens every link can't accept on someone's behalf.
 */
function toPage(req: NextRequest, done = false, mailed = false) {
  const from = req.nextUrl.searchParams;
  const q = new URLSearchParams({ a: "confirm", p: from.get("p") ?? "", e: from.get("e") ?? "", t: from.get("t") ?? "" });
  if (done) q.set("done", "1");
  if (mailed) q.set("mail", "1"); // only so the page can say "we just emailed you" when that is true
  // relative, so it works on any host the site is served from
  return new Response(null, { status: 303, headers: { location: `/supporter?${q}`, "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  return toPage(req);
}

export async function POST(req: NextRequest) {
  await ready();
  const q = req.nextUrl.searchParams;
  const e = (q.get("e") ?? "").toLowerCase();
  const p = await resolveSupporterLink("confirm", q.get("p") ?? "", e, q.get("t") ?? "");
  // The page works out what to say: accepted, withdrawn, or not a valid link.
  const r = p ? await confirmSupporter(p, e) : null;
  // `who` is the person being supported; the sponsor's own address is never written.
  if (!p) log.warn("supporter_link_refused", { purpose: "confirm" });
  else if (!r) log.warn("supporter_invite_gone", { who: who(p) });
  else if (r.first) log.info("supporter_accepted", { who: who(p) });
  // The first time they accept, they get one email to keep, with the link to stop. Pressing the button
  // again sends nothing. If it can't be sent they are still accepted, and the page shows the same link.
  let mailed = false;
  if (r?.first) {
    try {
      if (await allowNonAlertEmail()) {
        const stop = await stopUrl(r.sub, e);
        const mail = supporterWelcomeEmail(r.sub.name || (r.sub.lang === "es" ? "Alguien" : "Someone"), isLang(r.sub.lang) ? r.sub.lang : "en", stop, env.smsPending ? undefined : await textUrl(r.sub, e));
        const out = await sendEmail(e, mail.subject, mail.text, mail.html, undefined, undefined, stop);
        mailed = !out.skipped;
      } else {
        log.warn("supporter_welcome_held", { who: who(r.sub.phone), why: "email allowance held back for alerts" });
      }
    } catch (err) {
      log.error("supporter_welcome_failed", { who: who(r.sub.phone), err: reason(err) });
    }
  }
  return toPage(req, true, mailed);
}
