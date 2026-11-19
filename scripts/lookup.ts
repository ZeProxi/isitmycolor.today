/**
 * Answers "what happened for this person on this day?" from what the site has on record.
 *
 *   npx tsx scripts/lookup.ts someone@example.com 2026-11-19
 *   npx tsx scripts/lookup.ts "(801) 555-1234"            # no date: their recent alerts
 *
 * Shows their colors now and every change to them, and for the day asked about: what the hotline page
 * listed and when it was read, what their list was at that moment, and every alert attempted (channel by
 * channel, with the reason for any failure) or the record of why nothing was sent.
 *
 * Reads only. Prints a person's details to your own screen, so mind where you paste the output.
 */
import "dotenv/config";
import { findAccountByContact, getDayRecord, emailOf, smsOf } from "../src/lib/dynamo";
import { alertsOn, getQuietDay, listAlerts } from "../src/lib/alertlog";
import { normalizePhone } from "../src/lib/sms";
import { who } from "../src/lib/log";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " MT" : "?");
const list = (c?: string[]) => (c?.length ? c.join(", ") : "(none)");

async function main() {
  const args = process.argv.slice(2);
  const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const raw = args.filter((a) => a !== date).join(" ").trim();
  if (!raw) {
    console.error('usage: npx tsx scripts/lookup.ts <email or phone number> [YYYY-MM-DD]');
    process.exit(1);
  }
  const email = raw.includes("@");
  const value = email ? raw.toLowerCase() : normalizePhone(raw);
  if (!value) throw new Error("that isn't an email address or a phone number");
  const sub = await findAccountByContact({ kind: email ? "email" : "sms", value });
  console.log(`\nLog tag: ${who(value)}   (search the site's log group for this)\n`);
  if (!sub) {
    console.log("No alert is on record for that contact. Either they never finished signing up, or they stopped their\nalert, which deletes everything about them.");
  } else {
    console.log("THEIR ALERT");
    console.log(`  Colors now:      ${list(sub.colors)}`);
    console.log(`  Sends:           ${sub.prefs?.mode === "daily" ? "every day" : "only on their color days"}, not before ${sub.prefs?.earliestHour ?? 6}:00 MT`);
    console.log(`  Reached by:      ${[smsOf(sub) && !sub.smsStopped ? "text" : "", emailOf(sub) && !sub.emailStopped ? "email" : "", sub.push?.length ? `${sub.push.length} device(s)` : ""].filter(Boolean).join(", ") || "nothing right now"}${sub.smsStopped ? "  (texts stopped by STOP)" : ""}${sub.emailStopped ? "  (emails stopped)" : ""}`);
    console.log(`  Signed up:       ${when(sub.createdAt)}   agreed: ${when(sub.agreedAt)}${sub.prefs?.endDate ? `   ends after ${sub.prefs.endDate}` : ""}`);
    console.log("\nCHANGES TO THEIR COLORS (oldest first)");
    if (!sub.colorLog?.length) console.log("  None recorded. Changes are recorded from the day this was added; the list above is all that is known.");
    for (const c of sub.colorLog ?? []) console.log(`  ${when(c.at).padEnd(22)} ${c.was ? "already had:" : "changed to: "} ${list(c.colors)}`);
  }

  if (date) {
    console.log(`\nTHE DAY: ${date}`);
    const rec = await getDayRecord(date);
    const day = rec?.snapshot;
    const called = (day?.colors ?? []).map((c) => c.key);
    if (!rec || !day) console.log("  The site has no reading saved for that day.");
    else
      console.log(
        `  The hotline page listed: ${list(day.colors.map((c) => c.english || c.key))}\n  First seen: ${when(rec.firstSeenAt)}   last read: ${when(rec.updatedAt)}${day.layout === "fallback" ? "   (read by the backup method: colors may be missing)" : ""}`,
      );
    if (sub) {
      const sent = (await alertsOn(sub.phone, date)).sort((a, b) => a.at.localeCompare(b.at));
      const quiet = await getQuietDay(sub.phone, date);
      console.log("\n  WHAT WE DID FOR THEM THAT DAY");
      for (const a of sent) {
        const kind = a.kind === "match" ? "ALERT: their color was listed" : a.kind === "daily" ? 'daily "not your color" message' : a.kind === "test" ? "test they sent themselves" : a.kind === "ending" ? "end-date reminder" : "notice: page couldn't be read";
        console.log(`  ${when(a.at).padEnd(22)} ${kind}${a.colors?.length ? ` (${list(a.colors)})` : ""}`);
        console.log(`  ${"".padEnd(22)} text: ${a.sms ?? "-"}   email: ${a.email ?? "-"}   device: ${a.push ?? "-"}${a.mine ? `   their list then: ${list(a.mine)}` : ""}`);
        if (a.why) console.log(`  ${"".padEnd(22)} failure reason: ${a.why}`);
      }
      if (quiet) console.log(`  ${when(quiet.at).padEnd(22)} nothing sent: ${quiet.why === "not_listed" ? "none of their colors was listed" : "the page was only partly read and none of theirs was found"}\n  ${"".padEnd(22)} their list then: ${list(quiet.mine)}   page listed then: ${list(quiet.called)}`);
      if (!sent.length && !quiet) console.log("  Nothing on record: no alert attempted and no \"nothing sent\" entry. Either this is from before these\n  records were kept, the alert didn't exist yet, or the job didn't reach them (check the log for that morning).");
      if (day) {
        const now = sub.colors.filter((k) => called.includes(k));
        console.log(`\n  With the colors they have NOW, that day ${now.length ? `WAS their color day (${list(now)})` : "was NOT their color day"}.`);
      }
    }
  } else if (sub) {
    console.log("\nRECENT ALERTS (add a date to see one day in full)");
    const { alerts } = await listAlerts(sub.phone, 10);
    if (!alerts.length) console.log("  None yet.");
    for (const a of alerts) console.log(`  ${when(a.at).padEnd(22)} ${a.kind.padEnd(7)} for ${a.date}  ${list(a.colors)}  text:${a.sms ?? "-"} email:${a.email ?? "-"} device:${a.push ?? "-"}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
