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
import { ready } from "./config";

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
};

/** Bump when the agreement wording changes materially; people will be asked again. */
export const AGREEMENT_VERSION = 1;

export const DEFAULT_PREFS: AlertPrefs = { mode: "match", includeOfficial: false, earliestHour: 6 };

export type Subscriber = {
  /** E.164 phone, partition key, e.g. "+18015551234" */
  phone: string;
  email?: string;
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
  /** web push subscriptions (devices that allowed notifications) */
  push?: { endpoint: string; keys: { p256dh: string; auth: string }; addedAt: string; ua?: string }[];
  /** Who owns this row once auth is added (Cognito sub). Unused for now. */
  ownerId?: string;
};

export async function getSubscriber(phone: string): Promise<Subscriber | null> {
  const r = await (await client()).send(
    new GetCommand({ TableName: env.subscribersTable, Key: { phone } }),
  );
  return (r.Item as Subscriber) ?? null;
}

export async function upsertSubscriber(input: {
  phone: string;
  email?: string;
  colors: string[];
  lang?: string;
  prefs?: AlertPrefs;
  /** true = record acceptance of the current agreement now */
  agree?: boolean;
}): Promise<Subscriber> {
  const existing = await getSubscriber(input.phone);
  const now = nowIso();
  const item: Subscriber = {
    phone: input.phone,
    email: input.email === undefined ? existing?.email : input.email || undefined,
    colors: input.colors,
    lang: input.lang ?? existing?.lang,
    prefs: input.prefs ?? existing?.prefs ?? DEFAULT_PREFS,
    testSends: existing?.testSends,
    push: existing?.push,
    agreedAt: input.agree ? now : existing?.agreedAt,
    agreementVersion: input.agree ? AGREEMENT_VERSION : existing?.agreementVersion,
    active: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastNotifiedDate: existing?.lastNotifiedDate,
    ownerId: existing?.ownerId,
  };
  await (await client()).send(new PutCommand({ TableName: env.subscribersTable, Item: item }));
  return item;
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
  }
  return isNew;
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
// Stored in the subscribers table under key "otp#<phone>" so no extra table is needed.
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
