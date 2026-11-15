import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { normalizePhone } from "@/lib/sms";
import { verifyCode, makeSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { getSubscriber } from "@/lib/dynamo";

/** POST { phone, code } -> sets the session cookie and returns the profile (null if new) */
export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phone = normalizePhone(body.phone ?? "");
  const code = (body.code ?? "").replace(/\D/g, "");
  if (!phone || code.length !== 6) return Response.json({ error: "wrong" }, { status: 400 });

  const r = await verifyCode(phone, code);
  if (!r.ok) return Response.json({ error: r.error }, { status: 401 });

  (await cookies()).set(SESSION_COOKIE, makeSessionToken(phone), sessionCookieOptions());
  const subscriber = await getSubscriber(phone);
  return Response.json({ ok: true, phone, subscriber });
}
