import type { NextRequest } from "next/server";
import { parseContact } from "@/lib/contact";
import { sendCode } from "@/lib/auth";
import { findAccountByContact } from "@/lib/dynamo";
import { allow, allowNonAlertEmail, clientIp, today } from "@/lib/ratelimit";
import { getLang } from "@/lib/lang-server";
import { ready } from "@/lib/config";

/** POST { phone } or { email } -> sends a 6-digit code there (text or email) */
export async function POST(req: NextRequest) {
  let body: { phone?: unknown; email?: unknown; consent?: unknown; signin?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await ready();
  const contact = parseContact(body);
  if (!contact) return Response.json({ error: body.email ? "invalid_email" : "invalid_phone" }, { status: 400 });

  // A text is only ever sent to someone who has agreed to texts: by ticking the boxes now, or because the
  // number already has an alert (they agreed when they signed up) and they are signing back in.
  let returning = false;
  if (contact.kind === "sms" && body.consent !== true) {
    if (body.signin !== true) return Response.json({ error: "consent_required" }, { status: 400 });
    returning = true;
  }

  // Codes cost money (texts) or daily quota (email): cap per address and per day site-wide.
  const ip = clientIp(req);
  if (!(await allow(`codes:ip:${ip}`, 10, 3600))) return Response.json({ error: "rate_limited" }, { status: 429 });
  if (!(await allow(`codes:day:${today()}`, 300, 86400))) return Response.json({ error: "rate_limited" }, { status: 429 });

  // Emailed codes share a daily allowance with the alerts themselves. Codes stop first, so a burst of
  // sign-ups can't use up what tomorrow morning's alerts need.
  if (contact.kind === "email" && !(await allowNonAlertEmail())) {
    return Response.json({ error: "quota" }, { status: 503 });
  }

  if (returning && !(await findAccountByContact(contact))) {
    // No alert under this number: nothing is sent. The answer is the same either way, so this can't be
    // used to find out whether someone's number is signed up.
    return Response.json({ ok: true, kind: contact.kind, sentTo: contact.value });
  }
  const r = await sendCode(contact, await getLang(), contact.kind === "sms" && !returning ? new Date().toISOString() : undefined);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "rate_limited" ? 429 : r.error === "opted_out" ? 409 : r.error === "quota" ? 503 : 502 });
  return Response.json({ ok: true, kind: contact.kind, sentTo: contact.value, devCode: r.devCode });
}
