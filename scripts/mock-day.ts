/**
 * Writes a clearly-labeled MOCK history record so highlighting and day pages
 * can be previewed before real data exists. Remove it with --delete.
 *
 *   npx tsx scripts/mock-day.ts 2026-11-14 copper blue
 *   npx tsx scripts/mock-day.ts 2026-11-14 --delete
 */
import "dotenv/config";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, saveSnapshot, getSnapshot } from "../src/lib/dynamo";
import { env } from "../src/lib/env";
import { colorInfo } from "../src/lib/colors";

const [date, ...rest] = process.argv.slice(2);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("usage: npx tsx scripts/mock-day.ts YYYY-MM-DD color [color ...] | --delete");
  process.exit(1);
}

(async () => {
  if (rest[0] === "--delete") {
    await docClient().send(new DeleteCommand({ TableName: env.historyTable, Key: { pk: "DAY", sk: date } }));
    console.log("deleted", date);
    return;
  }
  const keys = rest.map((c) => c.toLowerCase());
  if (keys.length === 0) throw new Error("give at least one color");
  const [y, m, d] = date.split("-").map(Number);
  const dayName = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const dateText = `${m}/${d}/${y}`;
  const colors = keys.map((k) => {
    const i = colorInfo(k);
    const siteBackground = i.english.charAt(0).toUpperCase() + i.english.slice(1);
    return { key: k, raw: `${i.english.toLowerCase()}/${i.spanish.toLowerCase() || k}`, english: i.english.toLowerCase(), spanish: i.spanish.toLowerCase(), siteBackground };
  });
  const announcement = "MOCK DATA for testing isitmycolor.today. This is not a real hotline page.";
  const inputs = colors
    .map((c) => `<input name="a1" type="text" value="${c.raw}" class="css-input" style="background-color:${c.siteBackground};height:75px;width:325px;" /><br></br>`)
    .join("");
  const rawHtml = `<html><head><title>Colors</title></head><body><form><div><span id="Label4" style="font-size:XX-Large;font-weight:bold;">${announcement}</span><br /><br /><span id="Label1" style="font-size:XX-Large;font-weight:bold;">Colors for </span><span id="Label2" style="background-color:Yellow;font-size:XX-Large;font-weight:bold;">${dayName}</span><span id="Label3" style="font-size:XX-Large;font-weight:bold;"> ${dateText}</span><br /><div id="Panel1">${inputs}</div></div></form></body></html>`;
  await saveSnapshot({
    date,
    dateText,
    dayName,
    announcement,
    colors,
    sourceUrl: "https://wasatch.org/colors/",
    fetchedAt: `${date}T13:00:00.000Z`,
    rawHtml,
  });
  const back = await getSnapshot(date);
  console.log("saved", date, back?.colors.map((c) => c.raw));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
