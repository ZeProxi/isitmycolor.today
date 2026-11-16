import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";
import { sendSms } from "./sms";
import { sendEmail } from "./email";
import { nowIso, todayIsoMountain } from "./dates";
import type { ColorsSnapshot } from "./scrape";

/**
 * Watches the scraper for the owner. If the hotline page can't be read, parses
 * to nothing, or still shows yesterday late in the morning, the owner gets one
 * text and one email per problem per day with the reason. Subscribers are
 * never contacted by this.
 *
 * Owner contacts come from SSM: OWNER_PHONE (E.164) and OWNER_EMAIL.
 */
export type HealthProblem = "fetch_failed" | "no_colors" | "stale_page";

const STALE_AFTER_HOUR = 7; // Mountain time; the page normally flips at midnight

export function diagnose(snapshot: ColorsSnapshot | null, hour: number): HealthProblem | null {
  if (!snapshot) return "fetch_failed";
  if (snapshot.colors.length === 0) return "no_colors";
  if (snapshot.date !== todayIsoMountain() && hour >= STALE_AFTER_HOUR) return "stale_page";
  return null;
}

/** Sends the owner one alert per problem per day. */
export async function alertOwner(problem: HealthProblem, detail: string): Promise<"sent" | "already" | "no_owner"> {
  await ready();
  const phone = process.env.OWNER_PHONE ?? "";
  const email = process.env.OWNER_EMAIL ?? "";
  if (!phone && !email) return "no_owner";

  const key = { pk: "META", sk: `health#${todayIsoMountain()}#${problem}` };
  const existing = await docClient().send(new GetCommand({ TableName: env.historyTable, Key: key }));
  if (existing.Item) return "already";

  const msg = `isitmycolor.today check failed (${problem}): ${detail}. Subscribers were not texted.`;
  if (phone) await sendSms(phone, msg).catch(() => {});
  if (email) await sendEmail(email, `isitmycolor.today: scraper problem (${problem})`, msg).catch(() => {});
  await docClient().send(new PutCommand({ TableName: env.historyTable, Item: { ...key, problem, detail, at: nowIso() } }));
  return "sent";
}
