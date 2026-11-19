import * as webpush from "web-push";
import type { PushSubscription } from "web-push";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, getSubscriber } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";
import { nowIso } from "./dates";
import { log, reason, who } from "./log";

/**
 * Web push: free notifications to phones and desktops that have allowed them
 * (on iPhone, after adding the site to the home screen). Subscriptions live on
 * the subscriber record; dead ones are pruned when a send comes back 404/410.
 */

export type StoredPush = { endpoint: string; keys: { p256dh: string; auth: string }; addedAt: string; ua?: string };

/**
 * Browsers hand out push endpoints on a small set of hosts run by the browser
 * makers. The server sends requests to whatever endpoint is stored, so anything
 * else is refused: otherwise a signed-in person could point it at a URL of their
 * choosing and have this server call it.
 */
const PUSH_HOSTS = [/^(fcm|android)\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.username && !u.port && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

let configured = false;
function configure(): boolean {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(env.vapidSubject || "https://isitmycolor.today", env.vapidPublicKey, env.vapidPrivateKey);
    configured = true;
  }
  return true;
}

export async function addPushSubscription(phone: string, sub: PushSubscription, ua?: string) {
  await ready();
  const current = (await getSubscriber(phone))?.push ?? [];
  const next: StoredPush[] = [
    ...current.filter((p) => p.endpoint !== sub.endpoint),
    { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, addedAt: nowIso(), ua },
  ].slice(-5); // a handful of devices is plenty
  await savePush(phone, next);
  return next.length;
}

export async function removePushSubscription(phone: string, endpoint: string) {
  await ready();
  const current = (await getSubscriber(phone))?.push ?? [];
  await savePush(phone, current.filter((p) => p.endpoint !== endpoint));
}

async function savePush(phone: string, push: StoredPush[]) {
  await docClient().send(
    new UpdateCommand({
      TableName: env.subscribersTable,
      Key: { phone },
      UpdateExpression: "SET push = :p, updatedAt = :u",
      ExpressionAttributeValues: { ":p": push, ":u": nowIso() },
    }),
  );
}

/** Sends one notification to every device of a subscriber. Returns sent/failed counts. */
export async function sendPush(
  phone: string,
  subs: StoredPush[] | undefined,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ sent: number; failed: number; dryRun: boolean }> {
  await ready();
  if (!subs?.length) return { sent: 0, failed: 0, dryRun: false };
  if (env.pushDryRun) {
    console.log(`[PUSH_DRY_RUN] to ${phone} (${subs.length} devices): ${payload.title} - ${payload.body}`);
    return { sent: subs.length, failed: 0, dryRun: true };
  }
  if (!configure()) {
    log.error("push_not_configured", { who: who(phone) });
    return { sent: 0, failed: subs.length, dryRun: false };
  }
  let sent = 0;
  const dead: string[] = [];
  for (const s of subs) {
    if (!isPushEndpoint(s.endpoint)) {
      dead.push(s.endpoint); // stored before the host check existed: drop it
      continue;
    }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 404/410 is a device that turned notifications off: expected, and cleaned up below.
      if (code === 404 || code === 410) dead.push(s.endpoint);
      else log.error("push_failed", { who: who(phone), status: code, err: reason(e) });
    }
  }
  if (dead.length) await savePush(phone, subs.filter((s) => !dead.includes(s.endpoint)));
  return { sent, failed: subs.length - sent, dryRun: false };
}
