import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * One-click "stop these emails" links. The token is an HMAC of the phone, so
 * the link works without signing in but can't be forged for someone else.
 */
function token(phone: string): string {
  if (!env.sessionSecret) throw new Error("SESSION_SECRET (or CRON_SECRET) must be set");
  return createHmac("sha256", env.sessionSecret).update(`unsub:${phone}`).digest("base64url");
}

export function unsubscribeUrl(phone: string): string {
  const base = env.siteUrl || "https://isitmycolor.today";
  return `${base}/api/email/unsubscribe?p=${encodeURIComponent(phone)}&t=${token(phone)}`;
}

export function verifyUnsubscribe(phone: string, t: string): boolean {
  if (!phone || !t) return false;
  const a = Buffer.from(token(phone));
  const b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}
