import { fetchColors, type ColorsSnapshot } from "./scrape";
import { deleteSubscriber, emailOf, listActiveSubscribers, markNotified, saveSnapshot, setSmsStopped, smsOf, DEFAULT_PREFS, type Subscriber } from "./dynamo";
import { sendSms, listOptedOut } from "./sms";
import { sendEmail } from "./email";
import { todayIsoMountain, hourMountain, nowIso } from "./dates";
import { env } from "./env";
import { ready } from "./config";
import { requestScreenshot } from "./screenshot";
import { diagnose, alertOwner } from "./health";
import { sendPush } from "./push";
import { deleteAlerts, logAlert, type ChannelStatus } from "./alertlog";
import { unsubscribeUrl } from "./unsubscribe";
import { colorInfo } from "./colors";
import { t, isLang, type Lang } from "./i18n";
import { emailShell, emailText, esc, EMAIL_ACCENT } from "./email-layout";
import { activeSupporters, stopUrl, textUrl } from "./supporters";

export type NotifyResult = {
  snapshot: ColorsSnapshot;
  today: string;
  pageIsForToday: boolean;
  /** false when outside the texting window (snapshot still saved) */
  inNotifyWindow: boolean;
  hour: number;
  subscribersChecked: number;
  notified: { phone: string; colors: string[]; kind: "match" | "daily"; messageId?: string; dryRun: boolean; email?: string; smsError?: string; push?: string }[];
  skipped: { phone: string; reason: string }[];
  /** accounts removed this run because their own auto-stop date had passed */
  expired: string[];
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
        const c = colorInfo(k, snapshot.colors.find((x) => x.key === k));
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

/** The alert sentence without the text-message-only "Reply STOP" ending, for the plain-text part of an email. */
export function forEmail(message: string): string {
  return message.replace(/\s*(Reply STOP to opt out|Responde STOP para darte de baja)\.\s*$/, "");
}

/** HTML email: today's colors as flat tiles, the same sentence as the text, plus (if asked) the official page as captured. */
export function buildEmailHtml(
  snapshot: ColorsSnapshot,
  matched: string[],
  sub: Who,
  text: string,
  unsubscribe?: string,
  /** set when this copy goes to a support person: it talks about the holder by name, and `unsubscribe` is the supporter's own stop link */
  about?: { name: string; textUrl?: string },
): string {
  const l = langOf(sub);
  const s = t(l);
  const { fg, muted, line: rule, font } = emailText;
  const url = dayPageUrl(snapshot);
  const isMatch = matched.length > 0;
  const tiles = snapshot.colors
    .map((c) => {
      const info = colorInfo(c.key, c);
      const hex = c.siteBackground ?? info.hex;
      const mine = matched.includes(c.key);
      const primary = l === "es" ? c.spanish || info.spanish || c.english : c.english;
      const secondary = l === "es" ? c.english : c.spanish || info.spanish;
      return `<tr><td style="padding:0 0 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td bgcolor="${esc(hex)}" style="background:${esc(hex)};color:${info.text};border-radius:6px;padding:16px 18px;${mine ? `border:3px solid ${EMAIL_ACCENT};` : "border:1px solid rgba(255,255,255,0.15);"}">
            <span style="font:700 24px/1.1 ${font};text-transform:capitalize">${esc(primary)}</span>${secondary ? `<span style="font:500 14px/1.1 ${font};opacity:0.8"> &nbsp;${esc(secondary)}</span>` : ""}
            ${mine && !about ? `<span style="float:right;background:#ffffff;color:#131313;border-radius:3px;padding:3px 8px;font:700 11px/1.2 ${font}">${esc(s.home.yourColor)}</span>` : ""}
          </td>
        </tr></table>
      </td></tr>`;
    })
    .join("");
  const official = sub.prefs?.includeOfficial
    ? `<div style="margin-top:22px;padding:16px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#111">
         <p style="font:bold 13px Arial,sans-serif;margin:0 0 10px;color:#555">${esc(snapshot.sourceUrl)} &middot; ${esc(s.day.captured(capturedAt(snapshot, l)))}</p>
         ${snapshot.announcement ? `<p style="font:bold 17px Georgia,serif;margin:0 0 12px">${esc(snapshot.announcement)}</p>` : ""}
         <p style="font:bold 17px Georgia,serif;margin:0 0 8px">Colors for <span style="background:yellow">${esc(snapshot.dayName)}</span> ${esc(snapshot.dateText)}</p>
         ${snapshot.colors
           .map(
             (c) =>
               `<div style="background:${esc(c.siteBackground ?? colorInfo(c.key).hex)};font:18px Arial,sans-serif;padding:20px 10px;max-width:300px;margin:6px 0">${esc(c.raw)}</div>`,
           )
           .join("")}
         ${url ? `<p style="font:12px Arial,sans-serif;margin:12px 0 0"><a href="${esc(url)}">${esc(url)}</a></p>` : ""}
       </div>`
    : "";
  // The email says it in its own words: the text message's "Reply STOP" line means nothing here.
  const mineNames = matched
    .map((k) => {
      const c = colorInfo(k, snapshot.colors.find((x) => x.key === k));
      return l === "es" && c.spanish ? c.spanish : c.english;
    })
    .join(", ");
  const line = about ? s.supporter.emailLine(about.name, mineNames) : isMatch ? s.emailLine.match(mineNames) : snapshot.colors.length ? s.emailLine.noMatch : s.emailLine.none;
  const body = `      <p style="margin:0;font:600 13px/1.3 ${font};color:${muted}">${esc(snapshot.dayName)} ${esc(snapshot.dateText)}</p>
      <p style="margin:6px 0 18px;font:700 26px/1.15 ${font};color:${isMatch ? EMAIL_ACCENT : fg}">${esc(about ? s.supporter.emailSubject(about.name) : isMatch ? s.emailSubject.match : s.emailSubject.noMatch)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tiles}</table>
      <p style="margin:12px 0 0;padding-top:16px;border-top:1px solid ${rule};font:15px/1.55 ${font};color:${fg}">${esc(line)}</p>
      ${official}`;
  const footer = unsubscribe
    ? `${esc(about ? s.supporter.emailWhy(about.name) : s.emailWhy)} <a href="${esc(unsubscribe)}" style="color:${muted}">${esc(about ? s.supporter.emailStop : s.emailUnsubscribe)}</a>${about?.textUrl ? ` &middot; <a href="${esc(about.textUrl)}" style="color:${muted}">${esc(s.supporter.emailTextOffer)}</a>` : ""}`
    : undefined;
  return emailShell({ lang: l, preheader: `${line} ${forEmail(text)}`, body, footer });
}

/** Email each accepted support person. A failure for one of them never affects the holder or the others. */
async function notifySupporters(snapshot: ColorsSnapshot, matched: string[], sub: Subscriber, optedOut: Set<string> | null): Promise<void> {
  const l = langOf(sub);
  const s = t(l);
  const name = sub.name || (l === "es" ? "Alguien" : "Someone");
  const colors = matched
    .map((k) => {
      const c = colorInfo(k, snapshot.colors.find((x) => x.key === k));
      return l === "es" && c.spanish ? c.spanish : c.english;
    })
    .join(", ");
  for (const person of activeSupporters(sub)) {
    try {
      const stop = stopUrl(sub.phone, person.email);
      const line = s.supporter.emailLine(name, colors);
      // never the saved official page or the holder's own settings: just today's list and whose day it is
      // the offer of texts appears only once texting is live, and only until they've taken it
      const offer = !env.smsPending && !person.sms ? textUrl(sub.phone, person.email) : undefined;
      const html = buildEmailHtml(snapshot, matched, { lang: sub.lang, prefs: undefined }, line, stop, { name, textUrl: offer });
      await sendEmail(person.email, s.supporter.emailSubject(name), `${line}\n\n${s.supporter.emailStop}: ${stop}`, html, undefined, undefined, stop);
    } catch (e) {
      console.warn("supporter email failed", e instanceof Error ? e.message : e);
    }
    // A text only to a number they added and proved themselves, and never after a STOP.
    if (person.sms && !env.smsPending && !optedOut?.has(person.sms)) {
      try {
        await sendSms(person.sms, s.supporter.sms(name, colors.toUpperCase(), `${snapshot.dayName} ${snapshot.dateText}`));
      } catch (e) {
        console.warn("supporter text failed", e instanceof Error ? e.message : e);
      }
    }
  }
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
    expired: [],
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

  // Numbers that replied STOP: the carrier already blocks them; we stop trying and say so.
  const optedOut = await listOptedOut();
  for (const sub of subscribers) {
    // They asked to be opted out and forgotten after this date: same as pressing Stop.
    const endDate = sub.prefs?.endDate;
    if (endDate && today > endDate) {
      try {
        await Promise.all([deleteSubscriber(sub.phone), deleteAlerts(sub.phone)]);
        result.expired.push(sub.phone);
      } catch (e) {
        result.errors.push({ phone: sub.phone, error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }
    const number = smsOf(sub);
    if (optedOut && number) {
      const off = optedOut.has(number);
      if (off !== !!sub.smsStopped) {
        await setSmsStopped(sub.phone, off);
        sub.smsStopped = off ? nowIso() : undefined;
      }
    }
    const smsOff = !!sub.smsStopped;
    const address = sub.emailStopped ? undefined : emailOf(sub);
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
      if (number && !smsOff) {
        try {
          r = await sendSms(number, message);
        } catch (e) {
          smsError = e instanceof Error ? e.message : String(e);
        }
      }
      let email: string | undefined;
      if (address) {
        try {
          const subj = t(langOf(sub)).emailSubject[matched.length ? "match" : "noMatch"];
          const unsub = unsubscribeUrl(sub.phone);
          const text = `${forEmail(message)}\n\n${t(langOf(sub)).emailUnsubscribe}: ${unsub}`;
          const e = await sendEmail(address, subj, text, buildEmailHtml(snapshot, matched, sub, message, unsub), undefined, undefined, unsub);
          email = e.skipped ? `skipped: ${e.skipped}` : e.dryRun ? "dry-run" : "sent";
        } catch (e) {
          email = `failed: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      let push: string | undefined;
      if (sub.push?.length) {
        const title = t(langOf(sub)).emailSubject[matched.length ? "match" : "noMatch"];
        const pr = await sendPush(sub.phone, sub.push, { title, body: message, url: dayPageUrl(snapshot) ?? "/", tag: `day-${snapshot.date}` });
        push = pr.dryRun ? "dry-run" : `${pr.sent}/${pr.sent + pr.failed}`;
      }
      const st = (v?: string): ChannelStatus | undefined =>
        v === undefined ? undefined : v === "sent" || v.startsWith("1") ? "sent" : v === "dry-run" ? "dry-run" : v.startsWith("skipped") ? "skipped" : "failed";
      await logAlert(sub.phone, {
        date: snapshot.date!,
        kind: matched.length ? "match" : "daily",
        colors: matched,
        sms: !number ? undefined : smsOff ? "stopped" : smsError ? "failed" : r.dryRun ? "dry-run" : "sent",
        email: st(email),
        push: st(push),
      });
      // Something was tried and nothing got through: leave them un-notified so the next run tries again.
      const smsWent = !!number && !smsOff && !smsError;
      const emailWent = email === "sent" || email === "dry-run";
      const pushWent = push === "dry-run" || (!!push && !push.startsWith("0/"));
      const tried = (number && !smsOff) || address || sub.push?.length;
      if (tried && !smsWent && !emailWent && !pushWent) throw new Error(smsError ?? email ?? "nothing could be delivered");
      await markNotified(sub.phone, snapshot.date!);
      // Support people hear only on color days, and only after the holder's own alert has been dealt with.
      if (matched.length) await notifySupporters(snapshot, matched, sub, optedOut);
      result.notified.push({ phone: sub.phone, colors: matched, kind: matched.length ? "match" : "daily", email, smsError, push, ...r });
    } catch (e) {
      result.errors.push({ phone: sub.phone, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
