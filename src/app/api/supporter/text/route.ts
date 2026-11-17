import type { NextRequest } from "next/server";
import { getSubscriber } from "@/lib/dynamo";
import { sendCode, verifyCode } from "@/lib/auth";
import { normalizePhone } from "@/lib/sms";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";
import { allow, clientIp } from "@/lib/ratelimit";
import { setSupporterSms, resolveSupporterLink } from "@/lib/supporters";

/**
 * /api/supporter/text?p=<account>&e=<email>&t=<token>: where a support person who
 * already gets the emails can ask for texts too.
 *
 * They type their own number here and prove it with a code sent to it; only then
 * is it saved. The account holder never supplies it and never sees it. That keeps
 * texting to people who asked for it themselves, on the site, which is what the
 * carriers require. Unavailable while SMS_PENDING is on.
 *
 * Plain HTML forms, no script: GET shows the form, POST carries a `step`.
 */
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;padding:48px 20px;background:#131313;color:#f1f1ee;font:17px/1.5 system-ui,sans-serif}main{max-width:460px;margin:0 auto}h1{font-size:26px;line-height:1.2;margin:0 0 10px}p{margin:0 0 12px;color:#adada7}a{color:#f1f1ee}input{font:18px system-ui,sans-serif;width:100%;box-sizing:border-box;background:#0b0b0b;color:#f1f1ee;border:1px solid #474743;border-radius:6px;padding:12px;margin:0 0 12px}label{display:block;font-weight:600;margin:0 0 6px}.err{color:#ff7b72}.tick{display:flex;gap:10px;align-items:flex-start;font-weight:400;color:#f1f1ee;margin:0 0 12px}.tick input{width:20px;height:20px;margin:2px 0 0;flex:none;padding:0}.quiet{background:none;color:#adada7;text-decoration:underline;padding:0;font-weight:400}button{font:600 16px system-ui,sans-serif;background:#edb058;color:#131313;border:0;border-radius:6px;padding:12px 18px;cursor:pointer}.es{margin-top:26px;padding-top:18px;border-top:1px solid #2d2d2b}</style></head>
<body><main>${body}</main></body></html>`;
const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);


/** The account id and supporter email this link is for, once its signature checks out. */
async function read(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const e = (q.get("e") ?? "").toLowerCase();
  const p = await resolveSupporterLink("text", q.get("p") ?? "", e, q.get("t") ?? "");
  return { p: p ?? "", e, ok: !!p };
}
const invalid = () => html(page("Link not valid", "<h1>This link isn't valid.</h1>"), 400);
const gone = () => html(page("Not active", "<h1>These alerts are no longer active.</h1><p>The person who invited you removed you or stopped their alerts.</p>"), 410);
const notYet = () => html(page("Texts aren't available yet", "<h1>Texts aren't available yet.</h1><p>Texting is still being set up. Your emails continue as before.</p><p class=\"es\" lang=\"es\">Los textos aún no están disponibles. Tus correos siguen igual.</p>"));
const pretty = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

const askNumber = (who: string, error = "") =>
  page(
    "Get a text too?",
    `<h1>Get a text on ${who}'s color days too?</h1>
<p>One text on those days, alongside the email. Message and data rates may apply. Reply STOP to any text to end them.</p>
${error ? `<p class="err">${error}</p>` : ""}
<form method="post"><input type="hidden" name="step" value="send">
<label for="phone">Your mobile number</label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(801) 555-1234" required>
<label class="tick"><input type="checkbox" name="consent" value="yes" required> <span>I agree to receive automated text alerts from isitmycolor.today about ${who}'s UA color.</span></label>
<label class="tick"><input type="checkbox" name="unaffiliated" value="yes" required> <span>I understand this website is not affiliated with Wasatch Behavioral Health.</span></label>
<button type="submit">Text me a code</button></form>
<p style="margin-top:14px">US numbers only. If you'd rather not, close this page; nothing changes.</p>`,
  );

const askCode = (phone: string, error = "", devCode = "") =>
  page(
    "Enter the code",
    `<h1>Enter the 6-digit code</h1><p>Sent to ${pretty(phone)}. Good for 10 minutes.</p>
${devCode ? `<p>Dev mode: nothing is sent, your code is ${devCode}.</p>` : ""}
${error ? `<p class="err">${error}</p>` : ""}
<form method="post"><input type="hidden" name="step" value="verify"><input type="hidden" name="phone" value="${esc(phone)}">
<label for="code">Code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>
<button type="submit">Turn on texts</button></form>`,
  );

const current = (who: string, phone: string) =>
  page(
    "Texts are on",
    `<h1>Texts are on.</h1><p>You get a text on ${who}'s color days at ${pretty(phone)}, as well as the email.</p>
<form method="post"><input type="hidden" name="step" value="remove"><button type="submit" class="quiet">Stop the texts and forget this number</button></form>`,
  );

async function load(req: NextRequest) {
  await ready();
  const { p, e, ok } = await read(req);
  if (!ok) return { res: invalid() } as const;
  const sub = await getSubscriber(p);
  const me = sub?.supporters?.find((s) => s.email === e && s.status === "active");
  if (!sub || !me) return { res: gone() } as const;
  return { p, e, me, who: esc(sub.name || "their") } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await load(req);
  if ("res" in ctx) return ctx.res;
  if (ctx.me.sms) return html(current(ctx.who, ctx.me.sms));
  if (env.smsPending) return notYet();
  return html(askNumber(ctx.who));
}

export async function POST(req: NextRequest) {
  const ctx = await load(req);
  if ("res" in ctx) return ctx.res;
  const form = await req.formData().catch(() => null);
  const step = String(form?.get("step") ?? "");

  if (step === "remove") {
    await setSupporterSms(ctx.p, ctx.e, undefined);
    return html(page("Texts stopped", "<h1>Texts stopped.</h1><p>Your number was removed. The emails continue; each one has its own link to stop.</p>"));
  }
  if (env.smsPending) return notYet();

  const phone = normalizePhone(String(form?.get("phone") ?? ""));
  if (!phone || !phone.startsWith("+1")) return html(askNumber(ctx.who, "That doesn't look like a US mobile number."), 400);

  if (step === "send") {
    // Both boxes ticked by the person themselves, or no text is sent.
    if (form?.get("consent") !== "yes" || form?.get("unaffiliated") !== "yes") return html(askNumber(ctx.who, "Tick both boxes to continue."), 400);
    // Codes cost money: cap per address, per invitation, and (inside sendCode) per number.
    const okRate = (await allow(`suptext:ip:${clientIp(req)}`, 6, 3600)) && (await allow(`suptext:${ctx.p}:${ctx.e}`, 5, 86400));
    if (!okRate) return html(askNumber(ctx.who, "Too many tries. Wait a while and try again."), 429);
    const r = await sendCode({ kind: "sms", value: phone }, "en", new Date().toISOString());
    if (!r.ok) {
      const msg = r.error === "opted_out" ? "This number replied STOP earlier, so it can't get texts. Text START to the number that texted you, then try again." : r.error === "rate_limited" ? "Too many codes for this number. Wait a few minutes." : "Couldn't send the text. Check the number and try again.";
      return html(askNumber(ctx.who, msg), 400);
    }
    return html(askCode(phone, "", r.devCode ?? ""));
  }

  if (step === "verify") {
    if (!(await allow(`suptext:verify:${clientIp(req)}`, 30, 3600))) return html(askCode(phone, "Too many tries. Wait a while."), 429);
    const code = String(form?.get("code") ?? "").replace(/\D/g, "");
    const r = await verifyCode(phone, code);
    if (!r.ok) return html(askCode(phone, r.error === "expired" ? "That code expired. Go back and send a new one." : r.error === "too_many" ? "Too many tries. Go back and send a new code." : "That code didn't match. Try again."), 400);
    if (!(await setSupporterSms(ctx.p, ctx.e, phone, r.consentAt))) return gone();
    return html(current(ctx.who, phone));
  }
  return html(askNumber(ctx.who));
}
