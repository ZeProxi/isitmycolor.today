import { createHmac, timingSafeEqual } from "node:crypto";
import { clearEmail, findSubscribersByEmail } from "@/lib/dynamo";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";

/**
 * POST /api/resend/events: Resend delivers bounce and spam-complaint events here.
 *
 * A bounce or a complaint removes that address from the subscriber right away,
 * so it is never emailed again (they can add a new one on the site). This is
 * the Resend counterpart of /api/ses/events.
 *
 * Resend signs webhooks the Svix way: HMAC-SHA256 over "<id>.<timestamp>.<body>"
 * with the endpoint's signing secret (RESEND_WEBHOOK_SECRET, "whsec_<base64>").
 * Nothing is accepted without a valid, recent signature, so nobody can forge
 * an unsubscribe.
 */
const TOLERANCE_S = 5 * 60;

function verify(secret: string, id: string, timestamp: string, signatures: string, body: string): boolean {
  const ts = Number(timestamp);
  if (!id || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  // the header may carry several space-separated signatures, each "v1,<base64>"
  return signatures.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(req: Request) {
  await ready();
  const secret = env.resendWebhookSecret;
  if (!secret) return new Response("not configured", { status: 404 });

  const body = await req.text();
  const ok = verify(
    secret,
    req.headers.get("svix-id") ?? "",
    req.headers.get("svix-timestamp") ?? "",
    req.headers.get("svix-signature") ?? "",
    body,
  );
  if (!ok) return new Response("bad signature", { status: 403 });

  let ev: { type?: string; data?: { to?: string[] | string; bounce?: { type?: string } } };
  try {
    ev = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  let reason: "bounce" | "complaint" | null = null;
  // "email.bounced" means the receiving server rejected it for good; anything marked temporary is left alone.
  if (ev.type === "email.bounced" && !/^(transient|temporary)$/i.test(ev.data?.bounce?.type ?? "")) reason = "bounce";
  else if (ev.type === "email.complained") reason = "complaint";
  if (!reason) return new Response("ignored");

  const to = ev.data?.to;
  const addresses = (Array.isArray(to) ? to : to ? [to] : []).filter((a): a is string => typeof a === "string");
  let removed = 0;
  for (const addr of addresses) {
    for (const sub of await findSubscribersByEmail(addr)) {
      await clearEmail(sub.phone, reason);
      removed++;
    }
  }
  console.log(`resend events: ${reason} for ${addresses.length} address(es), ${removed} subscriber(s) updated`);
  return new Response("ok");
}
