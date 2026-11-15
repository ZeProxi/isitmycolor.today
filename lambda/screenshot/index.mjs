// Screenshots the hotline page with a real (headless) Chrome and stores the PNG
// in S3 as screenshots/<YYYY-MM-DD>.png, keyed by the date the page itself
// prints, so the image always matches the day it describes.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const SOURCE = process.env.SOURCE_URL ?? "https://wasatch.org/colors/";
const BUCKET = process.env.SCREENSHOT_BUCKET;
const s3 = new S3Client({});

function todayMountain() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export const handler = async (event = {}) => {
  if (!BUCKET) throw new Error("SCREENSHOT_BUCKET not set");
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 900, height: 520, deviceScaleFactor: 2 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 isitmycolor.today",
    );
    await page.goto(SOURCE, { waitUntil: "networkidle2", timeout: 30000 });

    // The date printed on the page, e.g. " 11/15/2026" -> 2026-11-15
    const printed = await page.$eval("#Label3", (el) => el.textContent?.trim() ?? "").catch(() => "");
    const m = printed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const date = m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : event.date ?? todayMountain();

    const png = await page.screenshot({ type: "png", fullPage: true });
    const capturedAt = new Date().toISOString();
    const key = `screenshots/${date}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: png,
        ContentType: "image/png",
        Metadata: { "captured-at": capturedAt, source: SOURCE, "page-date": printed },
      }),
    );
    // Keep every capture too, so a later re-capture of the same day doesn't erase the earlier one.
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `captures/${date}/${capturedAt.replace(/[:.]/g, "-")}.png`,
        Body: png,
        ContentType: "image/png",
      }),
    );
    return { ok: true, key, date, capturedAt, bytes: png.length };
  } finally {
    await browser.close();
  }
};
