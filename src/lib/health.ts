import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, findAccountByContact } from "./dynamo";
import { sendPush } from "./push";
import { env } from "./env";
import { ready } from "./config";
import { sendSms } from "./sms";
import { sendEmail } from "./email";
import { nowIso, todayIsoMountain } from "./dates";
import type { ColorsSnapshot } from "./scrape";

/**
 * Watches the scraper for the owner. If the hotline page can't be read, parses
 * to nothing, still shows yesterday late in the morning, lists a color name never
 * seen before, or calls "all colors", the owner gets one
 * text and one email per problem per day with the reason. Subscribers are
 * never contacted by this.
 *
 * Owner contacts come from SSM: OWNER_PHONE (E.164) and OWNER_EMAIL. The owner is told by text,
 * by email, and by a notification on any device their own account on the site has turned on.
 */
export type HealthProblem = "fetch_failed" | "no_colors" | "stale_page" | "new_color" | "all_colors";

const SUBJECT: Record<HealthProblem, string> = {
  fetch_failed: "couldn't reach the hotline page",
  no_colors: "no colors found on the page",
  stale_page: "page still shows another day",
  new_color: "new color name on the page",
  all_colors: "page calls all colors",
};

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

  const msg =
    problem === "new_color"
      ? `isitmycolor.today: the hotline listed a color name it has never used before: ${detail}. People are alerted by exact name, so check it isn't a typo or a new spelling of an existing color.`
      : problem === "all_colors"
        ? `isitmycolor.today: the hotline page says "${detail}", which was read as everyone being called. Every subscriber is being alerted. Check the page.`
        : `isitmycolor.today check failed (${problem}): ${detail}. Subscribers were not texted.`;
  // Every channel the owner has, each on its own: one failing never stops the others.
  if (phone) await sendSms(phone, msg).catch((e) => console.warn("[health] owner text failed:", e instanceof Error ? e.message : e));
  if (email) await sendEmail(email, `isitmycolor.today: ${SUBJECT[problem]}`, msg).catch((e) => console.warn("[health] owner email failed:", e instanceof Error ? e.message : e));
  // And a notification on the owner's own devices, if their account on this site has any turned on.
  // That reaches a phone even while texting isn't available.
  try {
    const account =
      (email ? await findAccountByContact({ kind: "email", value: email.trim().toLowerCase() }) : null) ??
      (phone ? await findAccountByContact({ kind: "sms", value: phone }) : null);
    if (account?.push?.length) await sendPush(account.phone, account.push, { title: `Site problem: ${SUBJECT[problem]}`, body: msg, url: "/", tag: `health-${problem}` });
  } catch (e) {
    console.warn("[health] owner notification failed:", e instanceof Error ? e.message : e);
  }
  await docClient().send(new PutCommand({ TableName: env.historyTable, Item: { ...key, problem, detail, at: nowIso() } }));
  return "sent";
}
