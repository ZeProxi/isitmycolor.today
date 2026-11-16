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

/** The caller's address, as CloudFront/Amplify report it. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export const today = () => todayIsoMountain();
