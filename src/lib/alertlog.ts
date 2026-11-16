import { QueryCommand, PutCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";
import { nowIso } from "./dates";

/**
 * Per-person record of every alert we tried to send, so a signed-in subscriber
 * can see what went to them, when, and over which channel. Lives in the history
 * table under pk "ALERT#<phone>", kept a year (TTL). Readable only through the
 * session cookie, which needs the phone code first.
 */
export type ChannelStatus = "sent" | "failed" | "dry-run" | "skipped";
export type AlertEntry = {
  at: string; // ISO timestamp
  date: string; // the color day it was about
  kind: "match" | "daily" | "test";
  colors: string[]; // matched color keys
  sms?: ChannelStatus;
  email?: ChannelStatus;
  push?: ChannelStatus;
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
    console.warn("alert log failed", e instanceof Error ? e.message : e); // never let bookkeeping block a send
  }
}

export async function listAlerts(phone: string, limit = 60): Promise<AlertEntry[]> {
  await ready();
  const r = await docClient().send(
    new QueryCommand({
      TableName: env.historyTable,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `ALERT#${phone}` },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (r.Items ?? []).map((i) => ({
    at: i.at as string,
    date: i.date as string,
    kind: i.kind as AlertEntry["kind"],
    colors: (i.colors as string[]) ?? [],
    sms: i.sms as ChannelStatus | undefined,
    email: i.email as ChannelStatus | undefined,
    push: i.push as ChannelStatus | undefined,
  }));
}

/** Forget someone's alert history (called when they stop alerts). */
export async function deleteAlerts(phone: string): Promise<void> {
  await ready();
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await docClient().send(
      new QueryCommand({
        TableName: env.historyTable,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": `ALERT#${phone}` },
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
