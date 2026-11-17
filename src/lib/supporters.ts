import { createHmac, timingSafeEqual } from "node:crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, getSubscriber, type Subscriber } from "./dynamo";
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
};

export const MAX_SUPPORTERS = 2;

type Purpose = "confirm" | "stop" | "text";

function token(purpose: Purpose, id: string, email: string): string {
  if (!env.sessionSecret) throw new Error("SESSION_SECRET (or CRON_SECRET) must be set");
  return createHmac("sha256", env.sessionSecret).update(`supporter:${purpose}:${id}:${email}`).digest("base64url");
}

function link(purpose: Purpose, id: string, email: string): string {
  const base = env.siteUrl || "https://isitmycolor.today";
  return `${base}/api/supporter/${purpose}?p=${encodeURIComponent(id)}&e=${encodeURIComponent(email)}&t=${token(purpose, id, email)}`;
}
export const confirmUrl = (id: string, email: string) => link("confirm", id, email);
export const stopUrl = (id: string, email: string) => link("stop", id, email);
/** Where a support person can add (or remove) their own number for texts. */
export const textUrl = (id: string, email: string) => link("text", id, email);

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

/** The supporter pressed "yes" on the invitation page. Returns the account, or null if the invitation is gone. */
export async function confirmSupporter(id: string, email: string): Promise<Subscriber | null> {
  const sub = await getSubscriber(id);
  const list = sub?.supporters ?? [];
  if (!sub || !list.some((s) => s.email === email)) return null;
  await saveSupporters(id, list.map((s) => (s.email === email ? { ...s, status: "active" as const, confirmedAt: s.confirmedAt ?? nowIso() } : s)));
  return sub;
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
export async function setSupporterSms(id: string, email: string, sms: string | undefined): Promise<boolean> {
  const sub = await getSubscriber(id);
  const list = sub?.supporters ?? [];
  if (!sub || !list.some((s) => s.email === email && s.status === "active")) return false;
  await saveSupporters(
    id,
    list.map((s) => {
      if (s.email !== email) return s;
      const { sms: _old, ...rest } = s;
      void _old;
      return sms ? { ...rest, sms } : rest;
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
