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
};

export const MAX_SUPPORTERS = 2;

function token(purpose: "confirm" | "stop", id: string, email: string): string {
  if (!env.sessionSecret) throw new Error("SESSION_SECRET (or CRON_SECRET) must be set");
  return createHmac("sha256", env.sessionSecret).update(`supporter:${purpose}:${id}:${email}`).digest("base64url");
}

function link(purpose: "confirm" | "stop", id: string, email: string): string {
  const base = env.siteUrl || "https://isitmycolor.today";
  return `${base}/api/supporter/${purpose}?p=${encodeURIComponent(id)}&e=${encodeURIComponent(email)}&t=${token(purpose, id, email)}`;
}
export const confirmUrl = (id: string, email: string) => link("confirm", id, email);
export const stopUrl = (id: string, email: string) => link("stop", id, email);

export function verifySupporterLink(purpose: "confirm" | "stop", id: string, email: string, t: string): boolean {
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
