import { fetchColors, type ColorsSnapshot } from "./scrape";
import { deleteSubscriber, emailOf, getKnownColorKeys, listActiveSubscribers, markNotified, markProblemNotice, saveSnapshot, setSmsStopped, smsOf, DEFAULT_PREFS, type Subscriber } from "./dynamo";
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
import { colorInfo, everyoneCalled, matchedColors, KNOWN_COLORS } from "./colors";
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
  /** accounts told this run that today's page couldn't be read */
  unreadableNotices: string[];
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

/**
 * What a device notification says: a short title and one line, nothing a lock
 * screen has to truncate. No list of the other colors and no "Reply STOP":
 * that belongs to texts, and a notification is turned off on the device.
 */
export function buildPushNote(snapshot: ColorsSnapshot, matched: string[], sub: Who): { title: string; body: string } {
  const l = langOf(sub);
  const n = t(l).push.note;
  if (matched.length) {
    const names = matched
      .map((k) => {
        const c = colorInfo(k, snapshot.colors.find((x) => x.key === k));
        return l === "es" && c.spanish ? c.spanish : c.english;
      })
      .join(", ");
    return { title: n.matchTitle(names), body: n.matchBody };
  }
  return { title: n.clearTitle, body: snapshot.colors.length ? n.clearBody : n.noneBody };
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
      const stop = await stopUrl(sub, person.email);
      const line = s.supporter.emailLine(name, colors);
      // never the saved official page or the holder's own settings: just today's list and whose day it is
      // the offer of texts appears only once texting is live, and only until they've taken it
      const offer = !env.smsPending && !person.sms ? await textUrl(sub, person.email) : undefined;
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
 * "We couldn't read today's colors": sent once per person per day when the
 * hotline page is down, stuck on another day, or empty, from
 * UNREADABLE_NOTICE_HOUR (8 am) or the person's own earliest hour, whichever is
 * later. It does not count as their daily alert, so if the page comes good
 * later they still get the real one. On those rare days that means two messages.
 */
async function sendUnreadableNotices(today: string, hour: number): Promise<string[]> {
  if (env.siteSunset) return [];
  if (hour < env.unreadableNoticeHour || hour < env.notifyStartHour || hour >= env.notifyEndHour) return [];
  const sent: string[] = [];
  const optedOut = await listOptedOut();
  for (const sub of await listActiveSubscribers()) {
    if (sub.lastProblemDate === today || sub.lastNotifiedDate === today) continue; // told already, or already got today's real alert
    if (hour < (sub.prefs?.earliestHour ?? DEFAULT_PREFS.earliestHour)) continue;
    if (sub.prefs?.endDate && today > sub.prefs.endDate) continue;
    const l = langOf(sub);
    const u = t(l).unreadable;
    const number = smsOf(sub);
    const address = sub.emailStopped ? undefined : emailOf(sub);
    let sms: ChannelStatus | undefined, email: ChannelStatus | undefined, push: ChannelStatus | undefined;
    if (number && !sub.smsStopped && !optedOut?.has(number)) {
      sms = await sendSms(number, u.sms).then((r) => (r.dryRun ? "dry-run" : "sent") as ChannelStatus, () => "failed" as ChannelStatus);
    }
    if (address) {
      const unsub = unsubscribeUrl(sub.phone);
      const { fg, muted, font } = emailText;
      const body = `      <p style="margin:0;font:700 24px/1.2 ${font};color:${EMAIL_ACCENT}">${esc(u.title)}</p>
      <p style="margin:12px 0 0;font:16px/1.55 ${font};color:${fg}">${esc(u.body)}</p>
      <p style="margin:12px 0 0;font:14px/1.55 ${font};color:${muted}">${esc(u.more)}</p>`;
      const html = emailShell({ lang: l, preheader: u.body, body, footer: `${esc(t(l).emailWhy)} <a href="${esc(unsub)}" style="color:${muted}">${esc(t(l).emailUnsubscribe)}</a>` });
      email = await sendEmail(address, u.title, `${u.title}. ${u.body}\n\n${u.more}\n\n${t(l).emailUnsubscribe}: ${unsub}`, html, undefined, undefined, unsub).then(
        (r) => (r.skipped ? "skipped" : r.dryRun ? "dry-run" : "sent") as ChannelStatus,
        () => "failed" as ChannelStatus,
      );
    }
    if (sub.push?.length) {
      const pr = await sendPush(sub.phone, sub.push, { title: u.title, body: u.body, url: "/", tag: `problem-${today}` });
      push = pr.dryRun ? "dry-run" : pr.sent > 0 ? "sent" : "failed";
    }
    const went = [sms, email, push].some((v) => v === "sent" || v === "dry-run");
    if (!went) continue; // nothing reached them: try again on the next run
    await markProblemNotice(sub.phone, today);
    await logAlert(sub.phone, { date: today, kind: "notice", colors: [], sms, email, push });
    sent.push(sub.phone);
  }
  return sent;
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
    await sendUnreadableNotices(todayIsoMountain(), hour).catch((err) => console.warn("unreadable notices failed", err));
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
    unreadableNotices: [],
    errors: [],
  };

  if (snapshot.date) {
    // A name the hotline has never used could be a typo or a new spelling of someone's color. People are
    // matched by exact name, so tell the owner to look. (Must be checked before saving adds it to the list.)
    if (pageIsForToday && snapshot.colors.length) {
      const seen = new Set([...KNOWN_COLORS.map((c) => c.key), ...(await getKnownColorKeys().catch(() => [] as string[]))]);
      const fresh = snapshot.colors.filter((c) => !seen.has(c.key)).map((c) => c.raw);
      if (fresh.length) await alertOwner("new_color", fresh.join(", ")).catch(() => {});
      if (everyoneCalled(snapshot.colors.map((c) => c.key))) await alertOwner("all_colors", snapshot.colors.map((c) => c.raw).join(", ")).catch(() => {});
    }
    const isNew = await saveSnapshot(snapshot);
    // First time we see a new day's page: grab the official screenshot right away.
    if (isNew) await requestScreenshot();
  }

  // Wound down: keep recording history, send nothing.
  if (env.siteSunset) return result;
  // Today's page isn't usable (still yesterday's, no date, or no colors on it). Nobody is alerted from it,
  // and once the morning is under way people are told, so silence isn't taken for "not my color".
  if ((!pageIsForToday || snapshot.colors.length === 0) && !opts.force) {
    result.unreadableNotices = await sendUnreadableNotices(today, hour).catch((err) => {
      console.warn("unreadable notices failed", err);
      return [];
    });
    return result;
  }
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
    const matched = matchedColors(sub.colors, todayKeys);
    if (matched.length === 0 && prefs.mode !== "daily") {
      result.skipped.push({ phone: sub.phone, reason: "no matching color" });
      continue;
    }
    if (hour < prefs.earliestHour && !opts.force) {
      result.skipped.push({ phone: sub.phone, reason: `before earliest hour (${prefs.earliestHour})` });
      continue;
    }
    if (sub.lastNotifiedDate === snapshot.date && !opts.force) {
      // One alert a day, with one exception: someone already told "not your color" whose color has since
      // been added to the page gets the correction. Leaving them with the wrong answer is the worse outcome.
      const correction = matched.length > 0 && sub.lastNotifiedKind === "daily";
      if (!correction) {
        result.skipped.push({ phone: sub.phone, reason: "already notified today" });
        continue;
      }
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
        const pr = await sendPush(sub.phone, sub.push, { ...buildPushNote(snapshot, matched, sub), url: dayPageUrl(snapshot) ?? "/", tag: `day-${snapshot.date}` });
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
      await markNotified(sub.phone, snapshot.date!, matched.length ? "match" : "daily");
      // Support people hear only on color days, and only after the holder's own alert has been dealt with.
      if (matched.length) await notifySupporters(snapshot, matched, sub, optedOut);
      result.notified.push({ phone: sub.phone, colors: matched, kind: matched.length ? "match" : "daily", email, smsError, push, ...r });
    } catch (e) {
      result.errors.push({ phone: sub.phone, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
