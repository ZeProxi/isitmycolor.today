import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";
import { todayIsoMountain } from "./dates";

/**
 * Small sliding-window rate limiter on DynamoDB (history table, pk "RL").
 * Good enough to keep a bored person or a script from running up SMS, email,
 * or compute costs; it is not a substitute for a WAF under a real flood.
 *
 *   await allow(`codes:ip:${ip}`, 10, 3600)      // 10 per hour for this address
 *   await allow(`codes:day:${today}`, 300, 86400) // 300 per day site-wide
 */
export async function allow(key: string, max: number, windowSec: number): Promise<boolean> {
  await ready();
  const now = Date.now();
  const Key = { pk: "RL", sk: key };
  const r = await docClient().send(new GetCommand({ TableName: env.historyTable, Key }));
  const hits = ((r.Item?.hits as number[] | undefined) ?? []).filter((t) => now - t < windowSec * 1000);
  if (hits.length >= max) return false;
  hits.push(now);
  await docClient().send(
    new PutCommand({
      TableName: env.historyTable,
      Item: { ...Key, hits, ttl: Math.floor(now / 1000) + windowSec * 2 },
    }),
  );
  return true;
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
