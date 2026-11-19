import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";
import { todayIsoMountain } from "./dates";

/**
 * Small rate limiter on DynamoDB (history table, pk "RL"): at most `max` in each window of `windowSec`.
 * Good enough to keep a bored person or a script from running up SMS, email,
 * or compute costs; it is not a substitute for a WAF under a real flood.
 *
 *   await allow(`codes:ip:${ip}`, 10, 3600)      // 10 per hour for this address
 *   await allow(`codes:day:${today}`, 300, 86400) // 300 per day site-wide
 *
 * The count and the check are one database operation. They used to be a read followed by a write, and a
 * burst of requests arriving together could all read "under the limit" before any of them wrote, so a
 * script firing a few thousand at once went straight through. Now each request adds one only if the
 * total is still under the limit, and the database decides that one request at a time.
 *
 * Windows are fixed (this hour, this day), not sliding: someone can use a full allowance at the end of
 * one window and again at the start of the next. That is at most double, briefly, and worth it for a
 * limit that can't be raced.
 */
export async function allow(key: string, max: number, windowSec: number): Promise<boolean> {
  await ready();
  const now = Date.now();
  const window = Math.floor(now / (windowSec * 1000));
  try {
    await docClient().send(
      new UpdateCommand({
        TableName: env.historyTable,
        Key: { pk: "RL", sk: `${key}#${window}` },
        UpdateExpression: "ADD #n :one SET #t = :ttl",
        ConditionExpression: "attribute_not_exists(#n) OR #n < :max",
        ExpressionAttributeNames: { "#n": "n", "#t": "ttl" },
        ExpressionAttributeValues: { ":one": 1, ":max": max, ":ttl": Math.floor(now / 1000) + windowSec * 2 },
      }),
    );
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

/**
 * The visitor's address, for rate limiting.
 *
 * X-Forwarded-For is a list that every hop appends to, and the visitor can send
 * a made-up list of their own, so its first entry proves nothing. What can be
 * trusted is what our own infrastructure appended at the end. On Amplify Hosting
 * a request arrives as
 *
 *     <anything the visitor sent>, <visitor's real address>, <CloudFront edge>
 *
 * (checked against the live site with /api/cron/notify?diag=1), so the real
 * address is the entry before the last one. TRUSTED_PROXY_HOPS says how many
 * entries our own proxies add after the visitor's; it is 1 on Amplify and can
 * be set for a different host.
 */
export function clientIp(req: Request): string {
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return req.headers.get("x-real-ip") || "unknown";
  const hops = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 0);
  // Fewer entries than expected (local dev, or a direct hit): the last one is the nearest known address.
  return parts[parts.length - 1 - hops] ?? parts[parts.length - 1];
}

export const today = () => todayIsoMountain();

/**
 * One shared daily budget for every email that isn't an alert: sign-in codes,
 * support-person invitations and contact-form messages. The email provider's
 * allowance is per UTC day and alerts draw on the same one, so everything a
 * visitor can trigger is held well under it. Whatever anyone does on the site,
 * the morning's alerts keep their share.
 */
export async function allowNonAlertEmail(): Promise<boolean> {
  const utcDay = new Date().toISOString().slice(0, 10);
  return allow(`mail:nonalert:${utcDay}`, env.emailCodeDailyCap, 86400);
}
