import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { env, awsCredentials } from "./env";
import type { ColorsSnapshot } from "./scrape";
import { nowIso } from "./dates";
import { KNOWN_COLORS, textOn, type ColorInfo } from "./colors";
import { ready } from "./config";
import { derivedId, type Contact, type ContactKind, type Contacts } from "./contact";

let _doc: DynamoDBDocumentClient | null = null;
export function docClient() {
  if (!_doc) {
    const client = new DynamoDBClient({ region: env.region, credentials: awsCredentials() });
    _doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _doc;
}

/** The document client, after config (table names, region) is guaranteed loaded. */
async function client() {
  await ready();
  return docClient();
}

// ---------- Subscribers ----------

export type AlertPrefs = {
  /** "match": only on days a chosen color is listed. "daily": a text every day either way. */
  mode: "match" | "daily";
  /** Add a link to (text) / inline copy of (email) the saved official page. */
  includeOfficial: boolean;
  /** Don't text before this Mountain-time hour (1-12; default 6). */
  earliestHour: number;
  /** Last day (YYYY-MM-DD, Mountain) alerts are wanted. The day after, the alert is removed as if they pressed Stop. */
  endDate?: string;
};

/** Bump when the agreement wording changes materially; people will be asked again. */
export const AGREEMENT_VERSION = 1;

export const DEFAULT_PREFS: AlertPrefs = { mode: "match", includeOfficial: false, earliestHour: 6 };

export type Subscriber = {
  /**
   * Account id and partition key. The attribute is still called `phone` because
   * that is the table's key, but it is an id, not a number to text: an E.164
   * phone for accounts that started with a number, "email:<address>" for ones
   * that started with an email, or "acct:<uuid>". Read the contacts with
   * smsOf() / emailOf(), never from this field.
   */
  phone: string;
  /** Verified mobile number texts go to. "" means it was removed; undefined on older rows, where the id is the number. */
  sms?: string;
  email?: string;
  /** true once the person proved the address with a code. Unverified addresses are never emailed. */
  emailVerified?: boolean;
  /** normalized color keys, e.g. ["green", "blue"] */
  colors: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** YYYY-MM-DD of the last day we texted this subscriber */
  lastNotifiedDate?: string;
  /** "en" | "es": language for the text message */
  lang?: string;
  prefs?: AlertPrefs;
  /** When the person accepted the not-affiliated / use-at-your-own-risk agreement, and which wording. */
  agreedAt?: string;
  agreementVersion?: number;
  /** epoch ms of recent "text me now" test sends, for rate limiting */
  testSends?: number[];
  /** ISO time we noticed this number replied STOP to the carrier; texts are skipped until it replies START. */
  smsStopped?: string;
  /** Why the email was removed automatically (hard bounce, spam complaint, or the link in an email). */
  emailStopped?: { at: string; reason: "bounce" | "complaint" | "unsubscribe"; email: string };
  /** web push subscriptions (devices that allowed notifications) */
  push?: { endpoint: string; keys: { p256dh: string; auth: string }; addedAt: string; ua?: string }[];
  /**
   * Random id used in links that other people receive (support people's accept,
   * stop and text links). The account id itself is often the holder's phone
   * number or email, which must not travel in someone else's inbox.
   */
  pid?: string;
  /** What the account holder is called in emails to their support people, e.g. "Sam". */
  name?: string;
  /** People who get an email on this person's color days. See supporters.ts. */
  supporters?: { email: string; status: "invited" | "active"; invitedAt: string; confirmedAt?: string; sms?: string }[];
  /** Who owns this row once auth is added (Cognito sub). Unused for now. */
  ownerId?: string;
};

export async function getSubscriber(phone: string): Promise<Subscriber | null> {
  const r = await (await client()).send(
    new GetCommand({ TableName: env.subscribersTable, Key: { phone } }),
  );
  return (r.Item as Subscriber) ?? null;
}

/** The number to text for this account, if it has one. */
export function smsOf(sub: Pick<Subscriber, "phone" | "sms">): string | undefined {
  if (sub.sms !== undefined) return sub.sms || undefined;
  return sub.phone.startsWith("+") ? sub.phone : undefined;
}

/** The address this account proved it owns, if any. */
export function emailOf(sub: Pick<Subscriber, "email" | "emailVerified">): string | undefined {
  return sub.email && sub.emailVerified ? sub.email : undefined;
}

export function contactsOf(sub: Subscriber): Contacts {
  return { sms: smsOf(sub), email: emailOf(sub) };
}

/** Create the alert (with the contacts proven in this session) or update its colors, language and settings. */
export async function upsertSubscriber(input: {
  phone: string;
  colors: string[];
  lang?: string;
  prefs?: AlertPrefs;
  /** true = record acceptance of the current agreement now */
  agree?: boolean;
  /** used only when the row doesn't exist yet */
  contacts?: Contacts;
}): Promise<Subscriber> {
  const existing = await getSubscriber(input.phone);
  const now = nowIso();
  const item: Subscriber = {
    // a brand-new row starts from the contacts verified at sign-in
    ...(existing ?? {
      phone: input.phone,
      sms: input.contacts?.sms,
      email: input.contacts?.email,
      emailVerified: input.contacts?.email ? true : undefined,
      active: true,
      createdAt: now,
    }),
    colors: input.colors,
    lang: input.lang ?? existing?.lang,
    prefs: input.prefs ?? existing?.prefs ?? DEFAULT_PREFS,
    agreedAt: input.agree ? now : existing?.agreedAt,
    agreementVersion: input.agree ? AGREEMENT_VERSION : existing?.agreementVersion,
    active: true,
    updatedAt: now,
  } as Subscriber;
  await (await client()).send(new PutCommand({ TableName: env.subscribersTable, Item: item }));
  return item;
}

/** The account that holds this verified contact, or null. */
export async function findAccountByContact(c: Contact): Promise<Subscriber | null> {
  // Fast path: most accounts still live under the id their first contact gave them.
  const direct = await getSubscriber(derivedId(c));
  if (direct && (c.kind === "sms" ? smsOf(direct) : emailOf(direct)) === c.value) return direct;
  // Otherwise look for it on any row (a handful of rows; a scan is fine at this size).
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await (await client()).send(
      new ScanCommand({
        TableName: env.subscribersTable,
        FilterExpression: c.kind === "sms" ? "sms = :v" : "email = :v AND emailVerified = :t",
        ExpressionAttributeValues: c.kind === "sms" ? { ":v": c.value } : { ":v": c.value, ":t": true },
        ExclusiveStartKey,
      }),
    );
    const hit = (r.Items as Subscriber[] | undefined)?.find((i) => typeof i.active === "boolean");
    if (hit) return hit;
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return null;
}

/** Attach a contact the person just proved with a code. Clears any "stopped" flag for that channel. */
export async function setContact(id: string, c: Contact) {
  await (await client()).send(
    new UpdateCommand({
      TableName: env.subscribersTable,
      Key: { phone: id },
      UpdateExpression:
        c.kind === "sms" ? "SET sms = :v, updatedAt = :u REMOVE smsStopped" : "SET email = :v, emailVerified = :t, updatedAt = :u REMOVE emailStopped",
      ExpressionAttributeValues: c.kind === "sms" ? { ":v": c.value, ":u": nowIso() } : { ":v": c.value, ":t": true, ":u": nowIso() },
      ConditionExpression: "attribute_exists(phone)",
    }),
  );
}

/** Drop one channel from an account. The caller makes sure the other one remains. */
export async function removeContact(id: string, kind: ContactKind) {
  await (await client()).send(
    new UpdateCommand({
      TableName: env.subscribersTable,
      Key: { phone: id },
      // sms is set to "" rather than removed, so an id that is itself a number stops counting as one
      UpdateExpression: kind === "sms" ? "SET sms = :e, updatedAt = :u REMOVE smsStopped" : "SET updatedAt = :u REMOVE email, emailVerified, emailStopped",
      ExpressionAttributeValues: kind === "sms" ? { ":e": "", ":u": nowIso() } : { ":u": nowIso() },
      ConditionExpression: "attribute_exists(phone)",
    }),
  );
}

/**
 * Fold `from` into `into` after its owner proved they hold one of `from`'s
 * contacts: colors and devices are combined, `into` keeps its own settings and
 * picks up a channel it was missing, and `from` is deleted.
 */
export async function mergeAccounts(into: Subscriber, from: Subscriber): Promise<void> {
  const colors = Array.from(new Set([...into.colors, ...from.colors])).slice(0, 10);
  const push = [...(into.push ?? []), ...(from.push ?? []).filter((p) => !(into.push ?? []).some((q) => q.endpoint === p.endpoint))].slice(-5);
  const merged: Subscriber = { ...into, colors, push: push.length ? push : undefined, updatedAt: nowIso() };
  if (!smsOf(into) && smsOf(from)) merged.sms = smsOf(from);
  if (!emailOf(into) && emailOf(from)) {
    merged.email = emailOf(from);
    merged.emailVerified = true;
  }
  await (await client()).send(new PutCommand({ TableName: env.subscribersTable, Item: merged }));
  await deleteSubscriber(from.phone);
}

export async function deleteSubscriber(phone: string) {
  await (await client()).send(new DeleteCommand({ TableName: env.subscribersTable, Key: { phone } }));
}

export async function listActiveSubscribers(): Promise<Subscriber[]> {
  const out: Subscriber[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await (await client()).send(
      new ScanCommand({
        TableName: env.subscribersTable,
        FilterExpression: "active = :t",
        ExpressionAttributeValues: { ":t": true },
        ExclusiveStartKey,
      }),
    );
    out.push(...((r.Items as Subscriber[]) ?? []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

/** The account's public id for links, created the first time one is needed. */
export async function ensurePid(sub: Subscriber): Promise<string> {
  if (sub.pid) return sub.pid;
  const pid = randomUUID().replace(/-/g, "");
  try {
    await (await client()).send(
      new UpdateCommand({
        TableName: env.subscribersTable,
        Key: { phone: sub.phone },
        UpdateExpression: "SET pid = :p",
        ConditionExpression: "attribute_exists(phone) AND attribute_not_exists(pid)",
        ExpressionAttributeValues: { ":p": pid },
      }),
    );
    sub.pid = pid;
    return pid;
  } catch (e) {
    if ((e as { name?: string }).name !== "ConditionalCheckFailedException") throw e;
    return (await getSubscriber(sub.phone))?.pid ?? pid; // someone else set it first
  }
}

/** The account a public id belongs to (a handful of rows; a scan is fine at this size). */
export async function findByPid(pid: string): Promise<Subscriber | null> {
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await (await client()).send(
      new ScanCommand({ TableName: env.subscribersTable, FilterExpression: "pid = :p", ExpressionAttributeValues: { ":p": pid }, ExclusiveStartKey }),
    );
    if (r.Items?.length) return r.Items[0] as Subscriber;
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return null;
}

/** Every account that lists this email as a support person, invited or accepted. */
export async function findSupporting(email: string): Promise<Subscriber[]> {
  const out: Subscriber[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await (await client()).send(
      new ScanCommand({ TableName: env.subscribersTable, FilterExpression: "attribute_exists(supporters)", ExclusiveStartKey }),
    );
    for (const i of (r.Items ?? []) as Subscriber[]) if (i.supporters?.some((s) => s.email === email)) out.push(i);
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

/**
 * Marks today's opening animation as shown for this account. Returns true only
 * for the call that actually claimed it, so it plays once a day across devices.
 */
export async function claimDailyMoment(phone: string, date: string): Promise<boolean> {
  try {
    await (await client()).send(
      new UpdateCommand({
        TableName: env.subscribersTable,
        Key: { phone },
        UpdateExpression: "SET momentDate = :d",
        ConditionExpression: "attribute_exists(phone) AND (attribute_not_exists(momentDate) OR momentDate <> :d)",
        ExpressionAttributeValues: { ":d": date },
      }),
    );
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false; // already shown today, or no alert
    throw e;
  }
}

export async function markNotified(phone: string, date: string) {
  await (await client()).send(
    new UpdateCommand({
      TableName: env.subscribersTable,
      Key: { phone },
      UpdateExpression: "SET lastNotifiedDate = :d, updatedAt = :u",
      ExpressionAttributeValues: { ":d": date, ":u": nowIso() },
    }),
  );
}

/**
 * Stop emailing someone after a hard bounce, a spam complaint, or their own
 * unsubscribe click. The address stays on the account, since it may be how they
 * sign in; verifying it again turns emails back on.
 */
export async function clearEmail(phone: string, reason: "bounce" | "complaint" | "unsubscribe") {
  const cur = await getSubscriber(phone);
  if (!cur) return;
  await (await client()).send(
    new UpdateCommand({
      TableName: env.subscribersTable,
      Key: { phone },
      UpdateExpression: "SET emailStopped = :s, updatedAt = :u",
      ExpressionAttributeValues: { ":s": { at: nowIso(), reason, email: cur.email ?? "" }, ":u": nowIso() },
    }),
  );
}

/** Active subscribers using this email (a handful of rows; a scan is fine at this size). */
export async function findSubscribersByEmail(email: string): Promise<Subscriber[]> {
  const out: Subscriber[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await (await client()).send(
      new ScanCommand({
        TableName: env.subscribersTable,
        FilterExpression: "email = :e",
        ExpressionAttributeValues: { ":e": email.trim().toLowerCase() },
        ExclusiveStartKey,
      }),
    );
    out.push(...((r.Items ?? []) as Subscriber[]));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

/** Record (or clear) that the carrier has this number opted out of texts. */
export async function setSmsStopped(phone: string, stopped: boolean) {
  await (await client()).send(
    new UpdateCommand({
      TableName: env.subscribersTable,
      Key: { phone },
      UpdateExpression: stopped ? "SET smsStopped = :t, updatedAt = :u" : "REMOVE smsStopped SET updatedAt = :u",
      ExpressionAttributeValues: stopped ? { ":t": nowIso(), ":u": nowIso() } : { ":u": nowIso() },
    }),
  );
}

export async function recordTestSend(phone: string, sends: number[]) {
  await (await client()).send(
    new UpdateCommand({
      TableName: env.subscribersTable,
      Key: { phone },
      UpdateExpression: "SET testSends = :s, updatedAt = :u",
      ExpressionAttributeValues: { ":s": sends, ":u": nowIso() },
    }),
  );
}

// ---------- Colors history ----------
// pk = "DAY",  sk = YYYY-MM-DD      -> snapshot for that day
// pk = "META", sk = "known-colors"  -> set of every color key ever seen
// pk = "META", sk = "color#<key>"    -> how a color not in the built-in list looked on the site

export type DayRecord = {
  pk: "DAY";
  sk: string; // date
  snapshot: ColorsSnapshot; // without rawHtml
  /** the page HTML as fetched that day, kept as evidence of what the site showed */
  rawHtml?: string;
  /** when we first saw this day's page */
  firstSeenAt: string;
  updatedAt: string;
};

/** Store (or refresh) the record for the day the snapshot describes. Returns true the first time a day is seen. */
export async function saveSnapshot(full: ColorsSnapshot): Promise<boolean> {
  if (!full.date) return false;
  const { rawHtml, ...snapshot } = full;
  const existing = await (await client()).send(
    new GetCommand({
      TableName: env.historyTable,
      Key: { pk: "DAY", sk: full.date },
      ProjectionExpression: "firstSeenAt",
    }),
  );
  const isNew = !existing.Item?.firstSeenAt;
  const item: DayRecord = {
    pk: "DAY",
    sk: full.date,
    snapshot,
    rawHtml,
    firstSeenAt: (existing.Item?.firstSeenAt as string | undefined) ?? nowIso(),
    updatedAt: nowIso(),
  };
  await (await client()).send(new PutCommand({ TableName: env.historyTable, Item: item }));
  if (snapshot.colors.length) {
    await (await client()).send(
      new UpdateCommand({
        TableName: env.historyTable,
        Key: { pk: "META", sk: "known-colors" },
        UpdateExpression: "ADD #keys :k SET updatedAt = :u",
        ExpressionAttributeNames: { "#keys": "keys" },
        ExpressionAttributeValues: {
          ":k": new Set(snapshot.colors.map((c) => c.key)),
          ":u": nowIso(),
        },
      }),
    );
    // A color we don't have a swatch for: keep its names and the page's own background
    // so the picker, calendar, and texts show it properly without a code change.
    for (const c of snapshot.colors) {
      if (KNOWN_COLORS.some((k) => k.key === c.key)) continue;
      const hex = c.siteBackground || "#9ca3af";
      await (await client()).send(
        new PutCommand({
          TableName: env.historyTable,
          Item: { pk: "META", sk: `color#${c.key}`, key: c.key, english: cap(c.english), spanish: cap(c.spanish), hex, text: textOn(hex), lastSeen: snapshot.date, updatedAt: nowIso() },
        }),
      );
    }
  }
  return isNew;
}

const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : "");

/** Colors learned from the site that aren't in the built-in list. */
export async function getSeenColors(): Promise<ColorInfo[]> {
  const r = await (await client()).send(
    new QueryCommand({
      TableName: env.historyTable,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":pk": "META", ":p": "color#" },
    }),
  );
  return (r.Items ?? []).map((i) => ({ key: i.key as string, english: i.english as string, spanish: (i.spanish as string) ?? "", hex: i.hex as string, text: i.text as string }));
}

export async function getSnapshot(date: string): Promise<ColorsSnapshot | null> {
  const r = await (await client()).send(
    new GetCommand({ TableName: env.historyTable, Key: { pk: "DAY", sk: date } }),
  );
  return (r.Item as DayRecord | undefined)?.snapshot ?? null;
}

export async function listRecentSnapshots(limit = 14): Promise<ColorsSnapshot[]> {
  const r = await (await client()).send(
    new QueryCommand({
      TableName: env.historyTable,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": "DAY" },
      ExpressionAttributeNames: { "#s": "snapshot" },
      ProjectionExpression: "#s",
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return ((r.Items as DayRecord[]) ?? []).map((i) => i.snapshot);
}

/** The first day on record (YYYY-MM-DD), or null before anything has been saved. */
export async function getFirstDay(): Promise<string | null> {
  const r = await (await client()).send(
    new QueryCommand({
      TableName: env.historyTable,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": "DAY" },
      ProjectionExpression: "sk",
      ScanIndexForward: true,
      Limit: 1,
    }),
  );
  return (r.Items?.[0]?.sk as string | undefined) ?? null;
}

/** All recorded days in a month ("YYYY-MM"), oldest first. */
export async function listMonthSnapshots(month: string): Promise<ColorsSnapshot[]> {
  const r = await (await client()).send(
    new QueryCommand({
      TableName: env.historyTable,
      KeyConditionExpression: "pk = :p AND begins_with(sk, :m)",
      ExpressionAttributeValues: { ":p": "DAY", ":m": `${month}-` },
      ExpressionAttributeNames: { "#s": "snapshot" },
      ProjectionExpression: "#s",
      ScanIndexForward: true,
    }),
  );
  return ((r.Items as DayRecord[]) ?? []).map((i) => i.snapshot);
}

/** Full record for one day, including the raw HTML. */
export async function getDayRecord(date: string): Promise<DayRecord | null> {
  const r = await (await client()).send(
    new GetCommand({ TableName: env.historyTable, Key: { pk: "DAY", sk: date } }),
  );
  return (r.Item as DayRecord) ?? null;
}

export async function getKnownColorKeys(): Promise<string[]> {
  const r = await (await client()).send(
    new GetCommand({ TableName: env.historyTable, Key: { pk: "META", sk: "known-colors" } }),
  );
  const keys = r.Item?.keys as Set<string> | string[] | undefined;
  return keys ? Array.from(keys) : [];
}

// ---------- One-time codes (sign-in) ----------
// Stored in the subscribers table under key "otp#<phone or email>" so no extra table is needed.
// They never have `active`, so the subscriber scan filter ignores them.

export type OtpRecord = {
  phone: string; // "otp#+1801..."
  hash: string;
  expiresAt: number; // epoch ms
  attempts: number;
  sentAt: number[]; // epoch ms of recent sends, for rate limiting
};

export async function getOtp(phone: string): Promise<OtpRecord | null> {
  const r = await (await client()).send(
    new GetCommand({ TableName: env.subscribersTable, Key: { phone: `otp#${phone}` } }),
  );
  return (r.Item as OtpRecord) ?? null;
}

export async function putOtp(rec: OtpRecord) {
  await (await client()).send(new PutCommand({ TableName: env.subscribersTable, Item: rec }));
}

export async function deleteOtp(phone: string) {
  await (await client()).send(
    new DeleteCommand({ TableName: env.subscribersTable, Key: { phone: `otp#${phone}` } }),
  );
}
