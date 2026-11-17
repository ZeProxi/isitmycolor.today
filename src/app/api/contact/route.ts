import type { NextRequest } from "next/server";
import { sendEmail, isEmail } from "@/lib/email";
import { allow, allowNonAlertEmail, clientIp, today } from "@/lib/ratelimit";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";

/**
 * POST { message, from, name?, website? } -> emails the site owner, reply-to the sender.
 * Protections: email required, honeypot field ("website" must stay empty), length limits,
 * 3 per hour per address, 50 per day site-wide. The owner's address is
 * CONTACT_EMAIL in SSM, never in the code.
 */
export async function POST(req: NextRequest) {
  await ready();
  const to = env.contactEmail;
  if (!to) return Response.json({ error: "contact_disabled" }, { status: 404 });

  let body: { message?: unknown; from?: unknown; name?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.website === "string" && body.website.trim()) return Response.json({ ok: true }); // bot filled the honeypot: pretend
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const from = typeof body.from === "string" ? body.from.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (message.length < 10 || message.length > 2000) return Response.json({ error: "message_length" }, { status: 400 });
  if (!isEmail(from)) return Response.json({ error: "invalid_email" }, { status: 400 }); // email required: replies go there

  const ip = clientIp(req);
  if (!(await allow(`contact:ip:${ip}`, 3, 3600))) return Response.json({ error: "rate_limited" }, { status: 429 });
  if (!(await allow(`contact:day:${today()}`, 50, 86400))) return Response.json({ error: "rate_limited" }, { status: 429 });
  if (!(await allowNonAlertEmail())) return Response.json({ error: "rate_limited" }, { status: 429 });

  const text = [
    `From: ${name || "(no name)"} <${from}>`,
    `Address: ${ip}`,
    `Page language: ${req.headers.get("accept-language")?.slice(0, 40) ?? ""}`,
    "",
    message,
  ].join("\n");
  try {
    const r = await sendEmail(to, `[isitmycolor.today contact] ${name || from}`, text, undefined, from, env.contactFrom);
    if (r.skipped) return Response.json({ error: "contact_disabled" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
}
