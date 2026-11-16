import { fetchColors, type ColorsSnapshot } from "./scrape";
import { listActiveSubscribers, markNotified, saveSnapshot, DEFAULT_PREFS, type Subscriber } from "./dynamo";
import { sendSms } from "./sms";
import { sendEmail } from "./email";
import { todayIsoMountain, hourMountain } from "./dates";
import { env } from "./env";
import { ready } from "./config";
import { requestScreenshot } from "./screenshot";
import { diagnose, alertOwner } from "./health";
import { colorInfo } from "./colors";
import { t, isLang, type Lang } from "./i18n";

export type NotifyResult = {
  snapshot: ColorsSnapshot;
  today: string;
  pageIsForToday: boolean;
  /** false when outside the texting window (snapshot still saved) */
  inNotifyWindow: boolean;
  hour: number;
  subscribersChecked: number;
  notified: { phone: string; colors: string[]; kind: "match" | "daily"; messageId?: string; dryRun: boolean; email?: string; smsError?: string }[];
  skipped: { phone: string; reason: string }[];
  errors: { phone: string; error: string }[];
};

type Who = Pick<Subscriber, "lang" | "prefs">;

function langOf(sub: Who): Lang {
  return isLang(sub.lang) ? sub.lang : "en";
}

function dayPageUrl(snapshot: ColorsSnapshot): string | null {
  return env.siteUrl && snapshot.date ? `${env.siteUrl}/day/${snapshot.date}` : null;
}

function capturedAt(snapshot: ColorsSnapshot, l: Lang): string {
  return new Date(snapshot.fetchedAt).toLocaleTimeString(l === "es" ? "es-US" : "en-US", {
    timeZone: "America/Denver",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The text message for one subscriber. `matched` empty means a "not your color" daily text. */
export function buildMessage(snapshot: ColorsSnapshot, matched: string[], sub: Who): string {
  const l = langOf(sub);
  const s = t(l);
  const day = `${snapshot.dayName} ${snapshot.dateText}`;
  const all = snapshot.colors.map((c) => c.raw).join(", ");
  let msg: string;
  if (matched.length) {
    const mine = matched
      .map((k) => {
        const c = colorInfo(k);
        return (l === "es" && c.spanish ? c.spanish : c.english).toUpperCase();
      })
      .join(", ");
    msg = s.sms(mine, day, all);
  } else {
    msg = snapshot.colors.length ? s.smsNoMatch(day, all) : s.smsNoMatchNone(day);
  }
  const url = dayPageUrl(snapshot);
  if (sub.prefs?.includeOfficial && url) msg += s.smsLink(url);
  return msg;
}

const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** HTML email: our summary, plus (if asked) a rendering of the official page as captured. */
export function buildEmailHtml(snapshot: ColorsSnapshot, matched: string[], sub: Who, text: string): string {
  const l = langOf(sub);
  const s = t(l);
  const url = dayPageUrl(snapshot);
  const blocks = snapshot.colors
    .map((c) => {
      const info = colorInfo(c.key);
      const mine = matched.includes(c.key);
      return `<div style="background:${info.hex};color:${info.text};font:bold 22px/1 Arial,sans-serif;padding:18px 20px;border-radius:12px;margin:8px 0;${mine ? "outline:3px solid #fff;" : ""}">${esc(c.raw)}${mine ? " &#10003;" : ""}</div>`;
    })
    .join("");
  const official = sub.prefs?.includeOfficial
    ? `<div style="margin-top:24px;padding:16px;border:1px solid #ddd;border-radius:12px;background:#fff;color:#111">
         <p style="font:bold 13px Arial,sans-serif;margin:0 0 10px;color:#555">${esc(snapshot.sourceUrl)} &middot; ${esc(s.day.captured(capturedAt(snapshot, l)))}</p>
         ${snapshot.announcement ? `<p style="font:bold 17px Georgia,serif;margin:0 0 12px">${esc(snapshot.announcement)}</p>` : ""}
         <p style="font:bold 17px Georgia,serif;margin:0 0 8px">Colors for <span style="background:yellow">${esc(snapshot.dayName)}</span> ${esc(snapshot.dateText)}</p>
         ${snapshot.colors
           .map(
             (c) =>
               `<div style="background:${esc(c.siteBackground ?? colorInfo(c.key).hex)};font:18px Arial,sans-serif;padding:20px 10px;width:300px;margin:6px 0">${esc(c.raw)}</div>`,
           )
           .join("")}
         ${url ? `<p style="font:12px Arial,sans-serif;margin:12px 0 0"><a href="${esc(url)}">${esc(url)}</a></p>` : ""}
       </div>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0b1220;color:#eef2ff;font:15px/1.5 Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto">
      <p style="font:bold 24px Arial,sans-serif;margin:0 0 4px">${esc(matched.length ? s.emailSubject.match : s.emailSubject.noMatch)}</p>
      <p style="margin:0 0 16px;color:#9aa6c4">${esc(snapshot.dayName)} ${esc(snapshot.dateText)}</p>
      ${blocks}
      <p style="margin:16px 0 0">${esc(text)}</p>
      ${official}
      <p style="margin:24px 0 0;font-size:12px;color:#9aa6c4"><a style="color:#9aa6c4" href="${esc(snapshot.sourceUrl)}">${esc(snapshot.sourceUrl)}</a></p>
    </div></body></html>`;
}

/**
 * The daily job: scrape the page, record the snapshot, and text every active
 * subscriber who should hear from us today (at most once per day each).
 */
export async function runNotify(opts: { force?: boolean } = {}): Promise<NotifyResult> {
  await ready();
  const hour = hourMountain();
  let snapshot: ColorsSnapshot;
  try {
    snapshot = await fetchColors();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await alertOwner("fetch_failed", detail);
    throw e;
  }
  const problem = diagnose(snapshot, hour);
  if (problem) {
    await alertOwner(problem, problem === "stale_page" ? `page still shows ${snapshot.dateText}` : "no color boxes found on the page");
  }
  const today = todayIsoMountain();
  const pageIsForToday = snapshot.date === today;
  const inNotifyWindow = hour >= env.notifyStartHour && hour < env.notifyEndHour;

  const result: NotifyResult = {
    snapshot,
    today,
    pageIsForToday,
    inNotifyWindow,
    hour,
    subscribersChecked: 0,
    notified: [],
    skipped: [],
    errors: [],
  };

  if (snapshot.date) {
    const isNew = await saveSnapshot(snapshot);
    // First time we see a new day's page: grab the official screenshot right away.
    if (isNew) await requestScreenshot();
  }

  // Wound down: keep recording history, send nothing.
  if (env.siteSunset) return result;
  // Never text people based on a stale page (e.g. the site still shows yesterday).
  if (!pageIsForToday && !opts.force) return result;
  // The page flips at midnight; don't wake people up. Snapshot is already saved above.
  if (!inNotifyWindow && !opts.force) return result;

  const todayKeys = new Set(snapshot.colors.map((c) => c.key));
  const subscribers = await listActiveSubscribers();
  result.subscribersChecked = subscribers.length;

  for (const sub of subscribers) {
    const prefs = sub.prefs ?? DEFAULT_PREFS;
    const matched = sub.colors.filter((c) => todayKeys.has(c));
    if (matched.length === 0 && prefs.mode !== "daily") {
      result.skipped.push({ phone: sub.phone, reason: "no matching color" });
      continue;
    }
    if (hour < prefs.earliestHour && !opts.force) {
      result.skipped.push({ phone: sub.phone, reason: `before earliest hour (${prefs.earliestHour})` });
      continue;
    }
    if (sub.lastNotifiedDate === snapshot.date && !opts.force) {
      result.skipped.push({ phone: sub.phone, reason: "already notified today" });
      continue;
    }
    try {
      const message = buildMessage(snapshot, matched, sub);
      let r: { messageId?: string; dryRun: boolean } = { dryRun: false };
      let smsError: string | undefined;
      try {
        r = await sendSms(sub.phone, message);
      } catch (e) {
        smsError = e instanceof Error ? e.message : String(e);
      }
      let email: string | undefined;
      if (sub.email) {
        try {
          const subj = t(langOf(sub)).emailSubject[matched.length ? "match" : "noMatch"];
          const e = await sendEmail(sub.email, subj, message, buildEmailHtml(snapshot, matched, sub, message));
          email = e.skipped ? `skipped: ${e.skipped}` : e.dryRun ? "dry-run" : "sent";
        } catch (e) {
          email = `failed: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      if (smsError && email !== "sent") throw new Error(smsError);
      await markNotified(sub.phone, snapshot.date!);
      result.notified.push({ phone: sub.phone, colors: matched, kind: matched.length ? "match" : "daily", email, smsError, ...r });
    } catch (e) {
      result.errors.push({ phone: sub.phone, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
