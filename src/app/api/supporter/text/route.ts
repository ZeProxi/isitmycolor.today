import type { NextRequest } from "next/server";
import { getSubscriber } from "@/lib/dynamo";
import { sendCode, verifyCode } from "@/lib/auth";
import { normalizePhone } from "@/lib/sms";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";
import { allow, clientIp } from "@/lib/ratelimit";
import { setSupporterSms, resolveSupporterLink } from "@/lib/supporters";
import { getLang } from "@/lib/lang-server";
import { log, who } from "@/lib/log";

/**
 * /api/supporter/text?p=<account>&e=<email>&t=<token>: where a support person who
 * already gets the emails can ask for texts too.
 *
 * They type their own number and prove it with a code sent to it; only then
 * is it saved. The account holder never supplies it and never sees it. That keeps
 * texting to people who asked for it themselves, on the site, which is what the
 * carriers require. Unavailable while SMS_PENDING is on.
 *
 * GET sends the browser to the page (src/app/supporter). The page's form posts each
 * step here and gets back JSON: the screen to show next (`state`) and, when something
 * was wrong, an `error` code the page has words for.
 */
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const pretty = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams;
  const q = new URLSearchParams({ a: "text", p: from.get("p") ?? "", e: from.get("e") ?? "", t: from.get("t") ?? "" });
  return new Response(null, { status: 303, headers: { location: `/supporter?${q}`, "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  await ready();
  const q = req.nextUrl.searchParams;
  const e = (q.get("e") ?? "").toLowerCase();
  const p = await resolveSupporterLink("text", q.get("p") ?? "", e, q.get("t") ?? "");
  const sub = p ? await getSubscriber(p) : null;
  const me = sub?.supporters?.find((s) => s.email === e && s.status === "active");
  if (!p || !sub || !me) {
    log.warn(p ? "supporter_not_active" : "supporter_link_refused", { purpose: "text", who: who(p) });
    return json({ state: "inactive" }, 410);
  }

  const form = await req.formData().catch(() => null);
  const step = String(form?.get("step") ?? "");

  if (step === "remove") {
    await setSupporterSms(p, e, undefined);
    log.info("supporter_text_off", { who: who(p) });
    return json({ state: "removed" });
  }
  if (env.smsPending) return json({ state: "notyet" });

  const phone = normalizePhone(String(form?.get("phone") ?? ""));
  if (!phone || !phone.startsWith("+1")) return json({ state: "ask", error: "bad_number" }, 400);

  if (step === "send") {
    // Both boxes ticked by the person themselves, or no text is sent.
    if (form?.get("consent") !== "yes" || form?.get("unaffiliated") !== "yes") return json({ state: "ask", error: "tick_both" }, 400);
    // Codes cost money: cap per address, per invitation, and (inside sendCode) per number.
    const okRate = (await allow(`suptext:ip:${clientIp(req)}`, 6, 3600)) && (await allow(`suptext:${p}:${e}`, 5, 86400));
    if (!okRate) {
      log.warn("code_not_sent", { why: "support person: too many tries", ch: "sms", who: who(p) });
      return json({ state: "ask", error: "rate" }, 429);
    }
    const r = await sendCode({ kind: "sms", value: phone }, await getLang(), new Date().toISOString());
    if (!r.ok) log.warn("code_not_sent", { why: `support person: ${r.error}`, ch: "sms", who: who(p) });
    if (!r.ok) return json({ state: "ask", error: r.error === "opted_out" ? "opted_out" : r.error === "rate_limited" ? "code_rate" : "send_failed" }, 400);
    return json({ state: "code", phone: pretty(phone), devCode: r.devCode });
  }

  if (step === "verify") {
    if (!(await allow(`suptext:verify:${clientIp(req)}`, 30, 3600))) return json({ state: "code", error: "rate" }, 429);
    const code = String(form?.get("code") ?? "").replace(/\D/g, "");
    const r = await verifyCode(phone, code);
    if (!r.ok) {
      log.warn("code_rejected", { why: `support person: ${r.error}`, ch: "sms", who: who(p) });
      return json({ state: "code", error: r.error }, 400);
    }
    if (!(await setSupporterSms(p, e, phone, r.consentAt))) return json({ state: "inactive" }, 410);
    log.info("supporter_text_on", { who: who(p) });
    return json({ state: "on", phone: pretty(phone) });
  }
  return json({ state: "ask" });
}
