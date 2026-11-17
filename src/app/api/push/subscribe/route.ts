import type { NextRequest } from "next/server";
import { currentAccount } from "@/lib/auth";
import { addPushSubscription, removePushSubscription } from "@/lib/push";

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

/** POST { subscription } -> remember this device for the signed-in person */
export async function POST(req: NextRequest) {
  const phone = await currentAccount();
  if (!phone) return unauthorized();
  let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const s = body.subscription;
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth || !/^https:\/\//.test(s.endpoint)) {
    return Response.json({ error: "invalid_subscription" }, { status: 400 });
  }
  const devices = await addPushSubscription(
    phone,
    { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
    req.headers.get("user-agent")?.slice(0, 120) ?? undefined,
  );
  return Response.json({ ok: true, devices });
}

/** DELETE { endpoint } -> forget this device */
export async function DELETE(req: NextRequest) {
  const phone = await currentAccount();
  if (!phone) return unauthorized();
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.endpoint) return Response.json({ error: "missing_endpoint" }, { status: 400 });
  await removePushSubscription(phone, body.endpoint);
  return Response.json({ ok: true });
}
