import { createHmac, timingSafeEqual } from "node:crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ensurePid, findByPid, findHeir, findSupporting, getSubscriber, type Subscriber } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";
import { nowIso } from "./dates";

/**
 * Support people: someone the account holder chooses (a sponsor, a parent, a
 * case manager) who gets an email on the holder's color days.
 *
 * Nobody is emailed alerts without agreeing to it: adding a supporter only
 * sends an invitation, and alerts start once they press the button on the page
 * that invitation links to. Every alert they get carries a link to stop, and the
 * holder can remove them at any time. Supporters live on the holder's row, so
 * they disappear with the alert.
 */
export type Supporter = {
  email: string;
  status: "invited" | "active";
  invitedAt: string;
  confirmedAt?: string;
  /** Their own mobile number, which they added and proved with a code themselves. Never supplied by the holder. */
  sms?: string;
  /** When they ticked "I agree to receive automated text alerts" for that number. */
  smsConsentAt?: string;
};

export const MAX_SUPPORTERS = 2;

type Purpose = "confirm" | "stop" | "text";

function token(purpose: Purpose, id: string, email: string): string {
  if (!env.sessionSecret) throw new Error("SESSION_SECRET (or CRON_SECRET) must be set");
  return createHmac("sha256", env.sessionSecret).update(`supporter:${purpose}:${id}:${email}`).digest("base64url");
}

/**
 * A signed link for one supporter of one account. `p` is the account's public
 * id, never the account id (often the holder's phone or email); the signature
 * is still made over the real id.
 */
async function link(purpose: Purpose, sub: Subscriber, email: string): Promise<string> {
  const base = env.siteUrl || "https://isitmycolor.today";
  return `${base}/api/supporter/${purpose}?p=${await ensurePid(sub)}&e=${encodeURIComponent(email)}&t=${token(purpose, sub.phone, email)}`;
}
export const confirmUrl = (sub: Subscriber, email: string) => link("confirm", sub, email);
export const stopUrl = (sub: Subscriber, email: string) => link("stop", sub, email);
/** Where a support person can add (or remove) their own number for texts. */
export const textUrl = (sub: Subscriber, email: string) => link("text", sub, email);

/**
 * Checks a supporter link and returns the account id it is for, or null.
 * Links sent before public ids existed carry the account id in `p`; those keep working.
 */
export async function resolveSupporterLink(purpose: Purpose, p: string, email: string, t: string): Promise<string | null> {
  if (!p || !email || !t) return null;
  const legacy = p.startsWith("+") || p.startsWith("email:") || p.startsWith("acct:");
  const direct = legacy ? await getSubscriber(p) : await findByPid(p);
  if (direct) return verifySupporterLink(purpose, direct.phone, email, t) ? direct.phone : null;
  // The alert this link names is gone. If it was combined into another, its support people moved with it,
  // so the link (signed for the old alert) is honored for the combined one.
  const found = await findHeir(legacy ? { id: p } : { pid: p });
  return found && verifySupporterLink(purpose, found.was.id, email, t) ? found.heir.phone : null;
}

export function verifySupporterLink(purpose: Purpose, id: string, email: string, t: string): boolean {
  if (!id || !email || !t) return false;
  const a = Buffer.from(token(purpose, id, email));
  const b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Replace the account's supporter list (and, when given, the name supporters see). */
export async function saveSupporters(id: string, supporters: Supporter[], name?: string) {
  await ready();
  await docClient().send(
    new UpdateCommand({
      TableName: env.subscribersTable,
      Key: { phone: id },
      UpdateExpression: name === undefined ? "SET supporters = :s, updatedAt = :u" : "SET supporters = :s, #n = :n, updatedAt = :u",
      ExpressionAttributeValues: name === undefined ? { ":s": supporters, ":u": nowIso() } : { ":s": supporters, ":n": name, ":u": nowIso() },
      ...(name === undefined ? {} : { ExpressionAttributeNames: { "#n": "name" } }),
      ConditionExpression: "attribute_exists(phone)",
    }),
  );
}

/**
 * The supporter pressed "yes" on the invitation page. Returns the account and whether this press is the one
 * that accepted (false if they had already accepted), or null if the invitation is gone.
 */
export async function confirmSupporter(id: string, email: string): Promise<{ sub: Subscriber; first: boolean } | null> {
  const sub = await getSubscriber(id);
  const list = sub?.supporters ?? [];
  const me = list.find((s) => s.email === email);
  if (!sub || !me) return null;
  if (me.status === "active") return { sub, first: false };
  await saveSupporters(id, list.map((s) => (s.email === email ? { ...s, status: "active" as const, confirmedAt: s.confirmedAt ?? nowIso() } : s)));
  return { sub, first: true };
}

/** Remove a supporter (they pressed stop, or the holder removed them). Safe to call when they're already gone. */
export async function removeSupporter(id: string, email: string): Promise<void> {
  const sub = await getSubscriber(id);
  if (!sub?.supporters?.some((s) => s.email === email)) return;
  await saveSupporters(id, sub.supporters.filter((s) => s.email !== email));
}

/** Who gets a copy today. */
export const activeSupporters = (sub: Pick<Subscriber, "supporters">): Supporter[] => (sub.supporters ?? []).filter((s) => s.status === "active");

/** Set or clear the number a support person gets texts on. Returns false if they are no longer a supporter. */
export async function setSupporterSms(id: string, email: string, sms: string | undefined, consentAt?: string): Promise<boolean> {
  const sub = await getSubscriber(id);
  const list = sub?.supporters ?? [];
  if (!sub || !list.some((s) => s.email === email && s.status === "active")) return false;
  await saveSupporters(
    id,
    list.map((s) => {
      if (s.email !== email) return s;
      const { sms: _old, smsConsentAt: _oldConsent, ...rest } = s;
      void _old;
      void _oldConsent;
      return sms ? { ...rest, sms, smsConsentAt: consentAt } : rest;
    }),
  );
  return true;
}

/**
 * What the account holder is allowed to see about their support people: who,
 * and whether texts are on. Never the supporter's phone number, which they gave
 * to the site and not to the holder.
 */
export function supportersForHolder(sub: Pick<Subscriber, "supporters">): { email: string; status: "invited" | "active"; text: boolean }[] {
  return (sub.supporters ?? []).map((s) => ({ email: s.email, status: s.status, text: !!s.sms }));
}

/** The subscriber row as sent to the holder's own browser. */
export function forHolder<T extends Subscriber | null>(sub: T): T {
  return (sub ? { ...sub, supporters: supportersForHolder(sub) } : sub) as T;
}

/**
 * For someone who just proved an email address: the people they are (or were
 * invited to be) a support person for, with the link to act on each. Lets the
 * sign-up page say "you don't need an account for that" instead of walking a
 * sponsor into creating an alert of their own.
 */
export async function supportingFor(email: string): Promise<{ name: string; status: "invited" | "active"; link: string }[]> {
  const out: { name: string; status: "invited" | "active"; link: string }[] = [];
  for (const holder of await findSupporting(email)) {
    const me = holder.supporters?.find((s) => s.email === email);
    if (!me) continue;
    out.push({ name: holder.name || "", status: me.status, link: me.status === "active" ? await stopUrl(holder, email) : await confirmUrl(holder, email) });
  }
  return out;
}
