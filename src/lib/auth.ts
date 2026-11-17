import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { env } from "./env";
import { getOtp, putOtp, deleteOtp } from "./dynamo";
import { sendSms, isOptedOut } from "./sms";
import { sendEmail } from "./email";
import { codeEmail } from "./email-layout";
import { ready } from "./config";
import type { Contact, Contacts } from "./contact";

/**
 * Passwordless sign-in: we send a 6-digit code to a phone (text) or an email
 * address, the person types it back, and we set a signed cookie that says
 * "this browser is account X and has proven these contacts".
 * No Cognito needed: owning the phone or the inbox is the identity we care about.
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

export type SendResult = { ok: true; devCode?: string } | { ok: false; error: "rate_limited" | "sms_failed" | "email_failed" | "opted_out" };

export async function sendCode(c: Contact, lang: "en" | "es" = "en"): Promise<SendResult> {
  await ready();
  const now = Date.now();
  const prev = await getOtp(c.value);
  const recent = (prev?.sentAt ?? []).filter((t) => now - t < SEND_WINDOW_MS);
  if (recent.length >= MAX_SENDS_PER_WINDOW) return { ok: false, error: "rate_limited" };
  if (c.kind === "sms" && (await isOptedOut(c.value))) return { ok: false, error: "opted_out" }; // the carrier would drop it anyway

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await putOtp({
    phone: `otp#${c.value}`,
    hash: hmac(`${c.value}:${code}`),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    sentAt: [...recent, now],
  });

  const text = `${code} is your isitmycolor.today sign-in code. It expires in 10 minutes.`;
  // In dry-run mode nothing is sent, so hand the code back for local testing.
  if (c.kind === "sms" ? env.smsDryRun : env.emailDryRun) {
    console.log(`[CODE_DRY_RUN] to ${c.value}: ${text}`);
    return { ok: true, devCode: code };
  }
  try {
    if (c.kind === "sms") {
      await sendSms(c.value, text);
    } else {
      const mail = codeEmail(code, lang);
      const r = await sendEmail(c.value, mail.subject, mail.text, mail.html);
      if (r.skipped) return { ok: false, error: "email_failed" };
    }
  } catch {
    return { ok: false, error: c.kind === "sms" ? "sms_failed" : "email_failed" };
  }
  return { ok: true };
}

export type VerifyResult = { ok: true } | { ok: false; error: "expired" | "wrong" | "too_many" };

/** `value` is the phone or email the code was sent to. */
export async function verifyCode(value: string, code: string): Promise<VerifyResult> {
  await ready();
  const rec = await getOtp(value);
  if (!rec || Date.now() > rec.expiresAt) return { ok: false, error: "expired" };
  if (rec.attempts >= MAX_ATTEMPTS) return { ok: false, error: "too_many" };
  if (!safeEqual(rec.hash, hmac(`${value}:${code.trim()}`))) {
    await putOtp({ ...rec, attempts: rec.attempts + 1 });
    return { ok: false, error: rec.attempts + 1 >= MAX_ATTEMPTS ? "too_many" : "wrong" };
  }
  await deleteOtp(value);
  return { ok: true };
}

// ---------- sessions ----------

/** Who this browser is, and which contacts it has proven (needed until the alert row exists). */
export type Session = { id: string; contacts: Contacts };

export function makeSessionToken(id: string, contacts: Contacts = {}): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  // `phone` is the account id; the name predates email sign-in and is kept so existing cookies stay valid.
  const payload = Buffer.from(JSON.stringify({ phone: id, exp, sms: contacts.sms, email: contacts.email })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function readSessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    if (!safeEqual(sig, hmac(payload))) return null;
    const { phone, exp, sms, email } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      phone: string;
      exp: number;
      sms?: string;
      email?: string;
    };
    if (!phone || typeof exp !== "number" || exp < Date.now() / 1000) return null;
    // cookies from before email sign-in carry only a phone number, which was both id and contact
    const contacts: Contacts = sms || email ? { sms, email } : phone.startsWith("+") ? { sms: phone } : {};
    return { id: phone, contacts };
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

/** The signed-in browser's session, or null. */
export async function currentSession(): Promise<Session | null> {
  await connection(); // session expiry is checked against the clock: never prerender this
  await ready();
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Account id of the signed-in browser, or null. */
export async function currentAccount(): Promise<string | null> {
  return (await currentSession())?.id ?? null;
}
