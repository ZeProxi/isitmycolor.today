import { currentPhone } from "@/lib/auth";
import { getSubscriber, recordTestSend, setSmsStopped } from "@/lib/dynamo";
import { fetchColors } from "@/lib/scrape";
import { buildMessage, buildEmailHtml } from "@/lib/notify";
import { sendSms, isOptedOut } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { logAlert } from "@/lib/alertlog";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { t, isLang } from "@/lib/i18n";

const MAX_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/me/test -> texts (and emails) the signed-in person today's colors
 * right now, so they can confirm alerts reach them. Limited to 3 per day and
 * never counts as the daily alert.
 */
export async function POST() {
  const phone = await currentPhone();
  if (!phone) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sub = await getSubscriber(phone);
  if (!sub) return Response.json({ error: "no_alert" }, { status: 400 });

  const now = Date.now();
  const recent = (sub.testSends ?? []).filter((ts) => now - ts < DAY_MS);
  if (recent.length >= MAX_PER_DAY) return Response.json({ error: "limit" }, { status: 429 });

  let snapshot;
  try {
    snapshot = await fetchColors();
  } catch {
    return Response.json({ error: "source_unavailable" }, { status: 502 });
  }
  const todayKeys = new Set(snapshot.colors.map((c) => c.key));
  const matched = sub.colors.filter((c) => todayKeys.has(c));
  const message = buildMessage(snapshot, matched, sub);

  await recordTestSend(phone, [...recent, now]);

  let sms: "sent" | "dry-run" | "failed" | "stopped" = "failed";
  let smsError: string | undefined;
  const stopped = await isOptedOut(phone); // replied STOP to the carrier
  if (stopped !== !!sub.smsStopped) await setSmsStopped(phone, stopped);
  if (stopped) {
    sms = "stopped";
  } else {
    try {
      const r = await sendSms(phone, message);
      sms = r.dryRun ? "dry-run" : "sent";
    } catch (e) {
      smsError = e instanceof Error ? e.message : String(e);
    }
  }

  let email: "sent" | "dry-run" | "skipped" | "failed" | undefined;
  if (sub.email) {
    try {
      const lang = isLang(sub.lang) ? sub.lang : "en";
      const unsub = unsubscribeUrl(phone);
      const e = await sendEmail(sub.email, t(lang).emailSubject[matched.length ? "match" : "noMatch"], `${message}\n\n${t(lang).emailUnsubscribe}: ${unsub}`, buildEmailHtml(snapshot, matched, sub, message, unsub), undefined, undefined, unsub);
      email = e.skipped ? "skipped" : e.dryRun ? "dry-run" : "sent";
    } catch {
      email = "failed";
    }
  }

  let push: "sent" | "dry-run" | "none" | "failed" = "none";
  if (sub.push?.length) {
    const lang = isLang(sub.lang) ? sub.lang : "en";
    const pr = await sendPush(phone, sub.push, { title: t(lang).emailSubject[matched.length ? "match" : "noMatch"], body: message, url: "/", tag: "test" });
    push = pr.dryRun ? "dry-run" : pr.sent > 0 ? "sent" : "failed";
  }

  await logAlert(phone, { date: snapshot.date ?? "", kind: "test", colors: matched, sms, email, push: push === "none" ? undefined : push });

  if ((sms === "failed" || sms === "stopped") && email !== "sent" && push !== "sent" && push !== "dry-run") {
    return Response.json({ error: sms === "stopped" ? "sms_stopped" : "send_failed", detail: smsError, email, push }, { status: sms === "stopped" ? 409 : 502 });
  }
  return Response.json({ ok: true, sms, dryRun: sms === "dry-run", email, push, remaining: MAX_PER_DAY - recent.length - 1 });
}
