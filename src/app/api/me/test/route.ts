import { currentAccount } from "@/lib/auth";
import { emailOf, getSubscriber, recordTestSend, smsOf } from "@/lib/dynamo";
import { fetchColors } from "@/lib/scrape";
import { buildMessage, buildEmailHtml, buildPushNote, forEmail } from "@/lib/notify";
import { isOptedOut, smsBlocked, syncAwsStop, textPerson } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { logAlert } from "@/lib/alertlog";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { t, isLang } from "@/lib/i18n";
import { matchedColors } from "@/lib/colors";
import { log, reason, who } from "@/lib/log";
import { allow } from "@/lib/ratelimit";

const MAX_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/me/test -> sends the signed-in person today's colors on every channel they have,
 * so they can confirm alerts reach them. Limited to 3 per day and
 * never counts as the daily alert.
 */
export async function POST() {
  const phone = await currentAccount();
  if (!phone) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sub = await getSubscriber(phone);
  if (!sub) return Response.json({ error: "no_alert" }, { status: 400 });

  const now = Date.now();
  const recent = (sub.testSends ?? []).filter((ts) => now - ts < DAY_MS);
  if (recent.length >= MAX_PER_DAY) return Response.json({ error: "limit" }, { status: 429 });
  // Same limit again, in a form a burst of simultaneous requests can't slip past (see ratelimit.ts).
  if (!(await allow(`test:${who(phone)}`, MAX_PER_DAY, 86400))) return Response.json({ error: "limit" }, { status: 429 });

  let snapshot;
  try {
    snapshot = await fetchColors();
  } catch {
    return Response.json({ error: "source_unavailable" }, { status: 502 });
  }
  const todayKeys = new Set(snapshot.colors.map((c) => c.key));
  const matched = matchedColors(sub.colors, todayKeys);
  const message = buildMessage(snapshot, matched, sub);

  await recordTestSend(phone, [...recent, now]);

  const why: string[] = []; // what went wrong on each channel, kept with the alert record
  let sms: "sent" | "dry-run" | "failed" | "stopped" | undefined;
  let smsError: string | undefined;
  const number = smsOf(sub);
  if (number) {
    await syncAwsStop(sub, await isOptedOut(number)); // replied STOP to the carrier
    if (smsBlocked(sub)) {
      sms = "stopped";
    } else {
      try {
        const r = await textPerson(sub, number, message);
        sms = r.stopped ? "stopped" : r.dryRun ? "dry-run" : "sent";
      } catch (e) {
        sms = "failed";
        smsError = e instanceof Error ? e.message : String(e);
        why.push(`sms: ${reason(e)}`);
        log.error("alert_failed", { kind: "test", ch: "sms", who: who(phone), err: reason(e) });
      }
    }
  }

  let email: "sent" | "dry-run" | "skipped" | "failed" | undefined;
  const address = sub.emailStopped ? undefined : emailOf(sub);
  if (address) {
    try {
      const lang = isLang(sub.lang) ? sub.lang : "en";
      const unsub = unsubscribeUrl(phone);
      const e = await sendEmail(address, t(lang).emailSubject[matched.length ? "match" : "noMatch"], `${forEmail(message)}\n\n${t(lang).emailUnsubscribe}: ${unsub}`, buildEmailHtml(snapshot, matched, sub, message, unsub), undefined, undefined, unsub);
      email = e.skipped ? "skipped" : e.dryRun ? "dry-run" : "sent";
    } catch (e) {
      email = "failed";
      why.push(`email: ${reason(e)}`);
      log.error("alert_failed", { kind: "test", ch: "email", who: who(phone), err: reason(e) });
    }
  }

  let push: "sent" | "dry-run" | "none" | "failed" = "none";
  if (sub.push?.length) {
    const pr = await sendPush(phone, sub.push, { ...buildPushNote(snapshot, matched, sub), url: "/", tag: "test" });
    push = pr.dryRun ? "dry-run" : pr.sent > 0 ? "sent" : "failed";
  }

  await logAlert(phone, { date: snapshot.date ?? "", kind: "test", colors: matched, sms, email, push: push === "none" ? undefined : push, why: why.join("; ") || undefined, mine: sub.colors });

  const went = (v?: string) => v === "sent" || v === "dry-run";
  if (!went(sms) && !went(email) && !went(push)) {
    return Response.json({ error: sms === "stopped" ? "sms_stopped" : "send_failed", detail: smsError, sms, email, push }, { status: sms === "stopped" ? 409 : 502 });
  }
  const dryRun = [sms, email, push].some((v) => v === "dry-run");
  return Response.json({ ok: true, sms, dryRun, email, push, remaining: MAX_PER_DAY - recent.length - 1 });
}
