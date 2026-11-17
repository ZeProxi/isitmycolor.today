import type { NextRequest } from "next/server";
import { parseContact } from "@/lib/contact";
import { sendCode } from "@/lib/auth";
import { allow, clientIp, today } from "@/lib/ratelimit";
import { getLang } from "@/lib/lang-server";

/** POST { phone } or { email } -> sends a 6-digit code there (text or email) */
export async function POST(req: NextRequest) {
  let body: { phone?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const contact = parseContact(body);
  if (!contact) return Response.json({ error: body.email ? "invalid_email" : "invalid_phone" }, { status: 400 });

  // Codes cost money (texts) or daily quota (email): cap per address and per day site-wide.
  const ip = clientIp(req);
  if (!(await allow(`codes:ip:${ip}`, 10, 3600))) return Response.json({ error: "rate_limited" }, { status: 429 });
  if (!(await allow(`codes:day:${today()}`, 300, 86400))) return Response.json({ error: "rate_limited" }, { status: 429 });

  const r = await sendCode(contact, await getLang());
  if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "rate_limited" ? 429 : r.error === "opted_out" ? 409 : 502 });
  return Response.json({ ok: true, kind: contact.kind, sentTo: contact.value, devCode: r.devCode });
}
