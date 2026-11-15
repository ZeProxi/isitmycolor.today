import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { env } from "./env";
import { getOtp, putOtp, deleteOtp } from "./dynamo";
import { sendSms } from "./sms";
import { ready } from "./config";

/**
 * Passwordless sign-in: we text a 6-digit code to the phone, the person types
 * it back, and we set a signed cookie that says "this browser is +1801...".
 * No Cognito needed: owning the phone is the identity we care about.
 */

export const SESSION_COOKIE = "session";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SESSION_TTL_S = 90 * 24 * 3600;

function hmac(data: string) {
  if (!env.sessionSecret) throw new Error("SESSION_SECRET (or CRON_SECRET) must be set");
  return createHmac("sha256", env.sessionSecret).update(data).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ---------- one-time codes ----------

export type SendResult = { ok: true; devCode?: string } | { ok: false; error: "rate_limited" | "sms_failed" };

export async function sendCode(phone: string): Promise<SendResult> {
  await ready();
  const now = Date.now();
  const prev = await getOtp(phone);
  const recent = (prev?.sentAt ?? []).filter((t) => now - t < SEND_WINDOW_MS);
  if (recent.length >= MAX_SENDS_PER_WINDOW) return { ok: false, error: "rate_limited" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await putOtp({
    phone: `otp#${phone}`,
    hash: hmac(`${phone}:${code}`),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    sentAt: [...recent, now],
  });

  try {
    await sendSms(phone, `${code} is your isitmycolor.today sign-in code. It expires in 10 minutes.`);
  } catch {
    return { ok: false, error: "sms_failed" };
  }
  // In dry-run mode nothing was actually sent, so hand the code back for local testing.
  return env.smsDryRun ? { ok: true, devCode: code } : { ok: true };
}

export type VerifyResult = { ok: true } | { ok: false; error: "expired" | "wrong" | "too_many" };

export async function verifyCode(phone: string, code: string): Promise<VerifyResult> {
  await ready();
  const rec = await getOtp(phone);
  if (!rec || Date.now() > rec.expiresAt) return { ok: false, error: "expired" };
  if (rec.attempts >= MAX_ATTEMPTS) return { ok: false, error: "too_many" };
  if (!safeEqual(rec.hash, hmac(`${phone}:${code.trim()}`))) {
    await putOtp({ ...rec, attempts: rec.attempts + 1 });
    return { ok: false, error: rec.attempts + 1 >= MAX_ATTEMPTS ? "too_many" : "wrong" };
  }
  await deleteOtp(phone);
  return { ok: true };
}

// ---------- sessions ----------

export function makeSessionToken(phone: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = Buffer.from(JSON.stringify({ phone, exp })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    if (!safeEqual(sig, hmac(payload))) return null;
    const { phone, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { phone: string; exp: number };
    if (!phone || typeof exp !== "number" || exp < Date.now() / 1000) return null;
    return phone;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_S,
  };
}

/** Phone number of the signed-in browser, or null. */
export async function currentPhone(): Promise<string | null> {
  await connection(); // session expiry is checked against the clock: never prerender this
  await ready();
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
