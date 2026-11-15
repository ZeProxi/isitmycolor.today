/**
 * Run the daily scrape + notify job from the command line (same code the cron endpoint uses).
 *   npx tsx scripts/run-notify.ts            # normal
 *   npx tsx scripts/run-notify.ts --force    # ignore "already notified today" and stale-date guards
 */
import "dotenv/config";
import { runNotify } from "../src/lib/notify";

runNotify({ force: process.argv.includes("--force") })
  .then((r) => {
    const { snapshot, ...rest } = r;
    const { rawHtml: _html, ...snap } = snapshot;
    console.log(JSON.stringify({ snapshot: snap, ...rest }, null, 2));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
