import { createVerify } from "node:crypto";
import { clearEmail, findSubscribersByEmail } from "@/lib/dynamo";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";

/**
 * POST /api/ses/events — Amazon SNS delivers SES bounce and complaint events here.
 *
 * A hard bounce or a spam complaint removes that address from the subscriber
 * immediately, so it is never emailed again (they can add a new one on the site).
 * Every message is checked against the SNS signing certificate and must come
 * from our own topic (SES_EVENTS_TOPIC_ARN), so nobody can forge an unsubscribe.
 */
type SnsMessage = {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
};

const certCache = new Map<string, string>();

async function signingCert(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname) || !u.pathname.endsWith(".pem")) {
    throw new Error("unexpected certificate host");
  }
  const cached = certCache.get(url);
  if (cached) return cached;
  const pem = await (await fetch(url)).text();
  certCache.set(url, pem);
  return pem;
}

async function verifySns(m: SnsMessage): Promise<boolean> {
  const fields =
    m.Type === "Notification"
      ? (["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const)
      : (["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const);
  let canonical = "";
  for (const k of fields) {
    const v = m[k];
    if (v !== undefined) canonical += `${k}\n${v}\n`;
  }
  const algo = m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  const cert = await signingCert(m.SigningCertURL);
  return createVerify(algo).update(canonical, "utf8").verify(cert, m.Signature, "base64");
}

export async function POST(req: Request) {
  await ready();
  const topic = env.sesEventsTopicArn;
  if (!topic) return new Response("not configured", { status: 404 });

  let m: SnsMessage;
  try {
    m = JSON.parse(await req.text());
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (m.TopicArn !== topic) return new Response("wrong topic", { status: 403 });
  if (!(await verifySns(m).catch(() => false))) return new Response("bad signature", { status: 403 });

  if (m.Type === "SubscriptionConfirmation" && m.SubscribeURL) {
    const u = new URL(m.SubscribeURL);
    if (u.protocol !== "https:" || !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname)) return new Response("bad url", { status: 400 });
    await fetch(m.SubscribeURL);
    console.log("ses events: subscription confirmed");
    return new Response("confirmed");
  }
  if (m.Type !== "Notification") return new Response("ok");

  // SES event payload (configuration-set event publishing)
  let ev: {
    eventType?: string;
    notificationType?: string;
    bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress: string }[] };
    complaint?: { complainedRecipients?: { emailAddress: string }[] };
  };
  try {
    ev = JSON.parse(m.Message);
  } catch {
    return new Response("ok");
  }
  const kind = (ev.eventType ?? ev.notificationType ?? "").toLowerCase();
  const addresses: string[] = [];
  let reason: "bounce" | "complaint" | null = null;
  if (kind === "bounce" && ev.bounce?.bounceType === "Permanent") {
    reason = "bounce";
    addresses.push(...(ev.bounce.bouncedRecipients ?? []).map((r) => r.emailAddress));
  } else if (kind === "complaint") {
    reason = "complaint";
    addresses.push(...(ev.complaint?.complainedRecipients ?? []).map((r) => r.emailAddress));
  }
  if (!reason) return new Response("ignored");

  let removed = 0;
  for (const addr of addresses) {
    for (const sub of await findSubscribersByEmail(addr)) {
      await clearEmail(sub.phone, reason);
      removed++;
    }
  }
  console.log(`ses events: ${reason} for ${addresses.length} address(es), ${removed} subscriber(s) updated`);
  return new Response("ok");
}
