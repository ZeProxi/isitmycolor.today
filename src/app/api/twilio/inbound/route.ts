import { timingSafeEqual } from "node:crypto";
import { findAccountByContact, setSmsStopped } from "@/lib/dynamo";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";
import { log, reason, who } from "@/lib/log";
import { normalizePhone } from "@/lib/sms";

/**
 * POST /api/twilio/inbound — Twilio calls this when someone texts the site's number.
 *
 * The only replies that matter are STOP and START. Twilio acts on them itself (it stops or resumes
 * delivery and sends its own confirmation), but it has no list the site can read, and a text to a
 * stopped number is accepted and only rejected afterwards. So this is how the site finds out: it
 * records the stop, shows it on the person's Alerts page, and stops trying until they text START.
 *
 * Twilio signs in with a name and password set in the webhook address (TWILIO_WEBHOOK_SECRET), and
 * the request must name our own account and messaging service. Anything else is turned away.
 */
const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);
const START = new Set(["START", "UNSTOP", "YES"]);

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response/>'; // "nothing more to say": Twilio sends its own confirmation
const reply = (status = 200) => new Response(EMPTY, { status, headers: { "Content-Type": "text/xml" } });

function allowed(header: string | null): boolean {
  const secret = env.twilioWebhookSecret;
  if (!secret || !header?.startsWith("Basic ")) return false;
  const given = Buffer.from(Buffer.from(header.slice(6), "base64").toString("utf8").replace(/^[^:]*:/, ""));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(request: Request) {
  await ready();
  if (!allowed(request.headers.get("authorization"))) {
    // Twilio asks once without the password and repeats with it when challenged.
    return new Response("sign-in required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="twilio"' } });
  }
  const form = await request.formData().catch(() => null);
  const field = (k: string) => String(form?.get(k) ?? "");
  if (!form || field("AccountSid") !== env.twilioAccountSid || (field("MessagingServiceSid") && field("MessagingServiceSid") !== env.twilioMessagingService)) {
    log.warn("twilio_inbound_refused", { why: "not our account or service" });
    return new Response("forbidden", { status: 403 });
  }
  const number = normalizePhone(field("From"));
  const word = (field("OptOutType") || field("Body")).trim().toUpperCase();
  const what = STOP.has(word) ? "stop" : START.has(word) ? "start" : null;
  if (!number || !what) return reply(); // HELP or anything else: Twilio answers HELP itself, and nobody reads replies
  try {
    const sub = await findAccountByContact({ kind: "sms", value: number });
    if (!sub) {
      log.info("sms_reply", { what, known: false });
    } else if (what === "stop") {
      if (!sub.smsStopped) await setSmsStopped(sub.phone, true, "twilio");
      log.warn("sms_stopped", { who: who(sub.phone), via: "twilio" });
    } else if (sub.smsStopped && sub.smsStoppedVia === "twilio") {
      // START lifts only a stop that was made here. One made at the other texting company stays.
      await setSmsStopped(sub.phone, false);
      log.info("sms_resumed", { who: who(sub.phone), via: "twilio" });
    }
  } catch (e) {
    log.error("twilio_inbound_failed", { what, err: reason(e) });
    return new Response("try again", { status: 500 }); // Twilio retries
  }
  return reply();
}
