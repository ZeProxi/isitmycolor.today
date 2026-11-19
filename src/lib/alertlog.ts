import { QueryCommand, PutCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";
import { nowIso } from "./dates";
import { log, reason, who } from "./log";

/**
 * Per-person record of every alert we tried to send, so a signed-in subscriber
 * can see what went to them, when, and over which channel. Lives in the history
 * table under pk "ALERT#<phone>", kept a year (TTL). Readable only through the
 * session cookie, which needs the phone code first.
 */
export type ChannelStatus = "sent" | "failed" | "dry-run" | "skipped" | "stopped";
export type AlertEntry = {
  at: string; // ISO timestamp
  date: string; // the color day it was about
  kind: "match" | "daily" | "test" | "notice" | "ending"; // "notice": we couldn't read the page that day; "ending": their end date is near
  colors: string[]; // matched color keys
  sms?: ChannelStatus;
  email?: ChannelStatus;
  push?: ChannelStatus;
  /** Why a channel failed, for the owner looking into a report. Stored, never sent to the browser. */
  why?: string;
  /** The colors on their list when this was sent. Stored, never sent to the browser. */
  mine?: string[];
};

const KEEP_SEC = 365 * 24 * 3600;

export async function logAlert(phone: string, entry: Omit<AlertEntry, "at">): Promise<void> {
  await ready();
  const at = nowIso();
  try {
    await docClient().send(
      new PutCommand({
        TableName: env.historyTable,
        Item: { pk: `ALERT#${phone}`, sk: at, ...entry, at, ttl: Math.floor(Date.now() / 1000) + KEEP_SEC },
      }),
    );
  } catch (e) {
    log.error("alert_log_failed", { who: who(phone), err: reason(e) }); // never let bookkeeping block a send
  }
}

/**
 * A day on which someone was sent nothing because none of their colors was listed. Alerts leave a record;
 * without this, a quiet day leaves none, and "you never alerted me" can't be told apart from "it wasn't
 * your color". One per person per day, written the first time that day's page is read for them: their
 * list at that moment, what the page listed, and when. Kept a year under its own key ("DAYLOG#<id>"), so
 * it never appears in the alert history the person sees, and deleted with the rest when they stop.
 */
export type QuietDay = { date: string; at: string; why: "not_listed" | "partial_reading"; mine: string[]; called: string[] };

export async function logQuietDay(phone: string, day: Omit<QuietDay, "at">): Promise<void> {
  await ready();
  await docClient().send(
    new PutCommand({
      TableName: env.historyTable,
      Item: { pk: `DAYLOG#${phone}`, sk: day.date, ...day, at: nowIso(), ttl: Math.floor(Date.now() / 1000) + KEEP_SEC },
    }),
  );
}

export async function getQuietDay(phone: string, date: string): Promise<QuietDay | null> {
  await ready();
  const r = await docClient().send(new QueryCommand({ TableName: env.historyTable, KeyConditionExpression: "pk = :pk AND sk = :d", ExpressionAttributeValues: { ":pk": `DAYLOG#${phone}`, ":d": date } }));
  const i = r.Items?.[0];
  return i ? { date: i.date, at: i.at, why: i.why, mine: i.mine ?? [], called: i.called ?? [] } : null;
}

/** Every stored record of what was sent to someone on one day, as stored (including the fields the browser never gets). */
export async function alertsOn(phone: string, date: string): Promise<(AlertEntry & { why?: string; mine?: string[] })[]> {
  await ready();
  const r = await docClient().send(
    new QueryCommand({ TableName: env.historyTable, KeyConditionExpression: "pk = :pk", FilterExpression: "#d = :d", ExpressionAttributeNames: { "#d": "date" }, ExpressionAttributeValues: { ":pk": `ALERT#${phone}`, ":d": date } }),
  );
  return (r.Items ?? []) as (AlertEntry & { why?: string; mine?: string[] })[];
}

/**
 * One page of someone's alerts, newest first. `before` is the `at` of the last
 * entry already shown; `more` says whether older ones remain.
 */
export async function listAlerts(phone: string, limit = 10, before?: string): Promise<{ alerts: AlertEntry[]; more: boolean }> {
  await ready();
  const r = await docClient().send(
    new QueryCommand({
      TableName: env.historyTable,
      KeyConditionExpression: before ? "pk = :pk AND sk < :b" : "pk = :pk",
      ExpressionAttributeValues: before ? { ":pk": `ALERT#${phone}`, ":b": before } : { ":pk": `ALERT#${phone}` },
      ScanIndexForward: false,
      Limit: limit + 1, // one extra, only to learn whether there is another page
    }),
  );
  const items = r.Items ?? [];
  return { more: items.length > limit, alerts: items.slice(0, limit).map(toEntry) };
}

function toEntry(i: Record<string, unknown>): AlertEntry {
  return {
    at: i.at as string,
    date: i.date as string,
    kind: i.kind as AlertEntry["kind"],
    colors: (i.colors as string[]) ?? [],
    sms: i.sms as ChannelStatus | undefined,
    email: i.email as ChannelStatus | undefined,
    push: i.push as ChannelStatus | undefined,
  };
}

/** Forget someone's alert history and their quiet-day records (called when they stop alerts). */
export async function deleteAlerts(phone: string): Promise<void> {
  await ready();
  for (const pk of [`ALERT#${phone}`, `DAYLOG#${phone}`]) await deleteAll(pk);
}

async function deleteAll(pk: string): Promise<void> {
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await docClient().send(
      new QueryCommand({
        TableName: env.historyTable,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ProjectionExpression: "pk, sk",
        ExclusiveStartKey,
      }),
    );
    const keys = r.Items ?? [];
    for (let i = 0; i < keys.length; i += 25) {
      await docClient().send(
        new BatchWriteCommand({
          RequestItems: { [env.historyTable]: keys.slice(i, i + 25).map((k) => ({ DeleteRequest: { Key: { pk: k.pk, sk: k.sk } } })) },
        }),
      );
    }
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
