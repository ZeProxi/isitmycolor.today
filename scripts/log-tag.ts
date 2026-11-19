/**
 * Prints the tag the server logs use for a person, so their lines can be found.
 *
 *   npx tsx scripts/log-tag.ts someone@example.com
 *   npx tsx scripts/log-tag.ts "(801) 555-1234"
 *
 * Then search the site's log group for that tag (see "Logs" in the README).
 */
import { who } from "../src/lib/log";
import { normalizePhone } from "../src/lib/sms";

const arg = process.argv.slice(2).join(" ").trim();
if (!arg) {
  console.error("usage: npx tsx scripts/log-tag.ts <email or phone number>");
  process.exit(1);
}
const value = arg.includes("@") ? arg : (normalizePhone(arg) ?? arg);
console.log(who(value));
