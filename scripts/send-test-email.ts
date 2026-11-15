/**
 * Sends a real alert email for today's colors to one address, using the same
 * code path as the daily job. Handy for checking SES deliverability.
 *
 *   SMS_DRY_RUN=false EMAIL_FROM="My Color <alerts@isitmycolor.today>" \
 *     npx tsx scripts/send-test-email.ts you@example.com [color ...]
 */
import "dotenv/config";
import { fetchColors } from "../src/lib/scrape";
import { buildMessage, buildEmailHtml } from "../src/lib/notify";
import { sendEmail } from "../src/lib/email";
import { t } from "../src/lib/i18n";

const [to, ...colors] = process.argv.slice(2);
if (!to) {
  console.error("usage: npx tsx scripts/send-test-email.ts you@example.com [color ...]");
  process.exit(1);
}

(async () => {
  const snapshot = await fetchColors();
  const todayKeys = new Set(snapshot.colors.map((c) => c.key));
  const mine = colors.map((c) => c.toLowerCase());
  const matched = mine.filter((c) => todayKeys.has(c));
  const sub = { lang: "en", prefs: { mode: "daily" as const, includeOfficial: true, earliestHour: 6 } };
  const text = buildMessage(snapshot, matched, sub);
  const r = await sendEmail(to, t("en").emailSubject[matched.length ? "match" : "noMatch"], text, buildEmailHtml(snapshot, matched, sub, text));
  console.log(r.skipped ? `skipped: ${r.skipped}` : r.dryRun ? "dry run (set SMS_DRY_RUN=false)" : `sent, message id ${r.messageId}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
