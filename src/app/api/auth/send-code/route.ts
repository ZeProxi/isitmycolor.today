import type { NextRequest } from "next/server";
import { normalizePhone } from "@/lib/sms";
import { sendCode } from "@/lib/auth";

/** POST { phone } -> texts a 6-digit sign-in code */
export async function POST(req: NextRequest) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phone = normalizePhone(body.phone ?? "");
  if (!phone) return Response.json({ error: "invalid_phone" }, { status: 400 });

  const r = await sendCode(phone);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.error === "rate_limited" ? 429 : 502 });
  return Response.json({ ok: true, phone, devCode: r.devCode });
}
