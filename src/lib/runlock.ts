import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamo";
import { env } from "./env";
import { log, reason } from "./log";

/**
 * "A run is sending right now", kept as one row in the history table.
 *
 * The lock expires by itself after `seconds`, so a run that died without releasing it can't block the
 * ones after it for long.
 */
const KEY = { pk: "META", sk: "notify-lock" };

/** True if this run now holds the lock; false if another run does. */
export async function takeRunLock(seconds: number): Promise<boolean> {
  const now = Date.now();
  try {
    await docClient().send(
      new PutCommand({
        TableName: env.historyTable,
        Item: { ...KEY, until: now + seconds * 1000 },
        ConditionExpression: "attribute_not_exists(pk) OR #u < :now",
        ExpressionAttributeNames: { "#u": "until" },
        ExpressionAttributeValues: { ":now": now },
      }),
    );
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
    // The lock itself is unavailable. Alerts matter more than the guard, so the run goes ahead.
    log.error("run_lock_failed", { err: reason(e) });
    return true;
  }
}

export async function releaseRunLock(): Promise<void> {
  await docClient()
    .send(new DeleteCommand({ TableName: env.historyTable, Key: KEY }))
    .catch((e) => log.warn("run_lock_release_failed", { err: reason(e) }));
}
