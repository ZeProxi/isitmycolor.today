import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
  DescribeOptedOutNumbersCommand,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { env, awsCredentials } from "./env";
import { ready } from "./config";
import { log, reason, who } from "./log";
import { setSmsStopped } from "./dynamo";
import { nowIso } from "./dates";

/**
 * Texts go out through one of two companies, chosen by SMS_PROVIDER:
 *
 *   aws     AWS End User Messaging, from the registered toll-free number. (Not SNS: SNS accepts a
 *           text for that number and then fails to deliver it.)
 *   twilio  Twilio, from the number in the registered messaging service.
 *
 * Both stay set up so one setting moves everything across if one has trouble. Nothing falls back by
 * itself: each company keeps its own STOP list for its own number, so a text that quietly went out
 * through the other one could reach someone who had opted out.
 */
let _sms: PinpointSMSVoiceV2Client | null = null;
function sms() {
  if (!_sms) _sms = new PinpointSMSVoiceV2Client({ region: env.region, credentials: awsCredentials() });
  return _sms;
}

/** The list AWS adds a number to when it replies STOP, and takes it off on START. */
const OPT_OUT_LIST = "Default";

/** Thrown when the texting company refuses a text because the number replied STOP. */
export class SmsStopped extends Error {
  constructor() {
    super("this number replied STOP");
    this.name = "SmsStopped";
  }
}

/** Every text names the site, as the registered sample messages do. */
const BRAND = "isitmycolor.today";
/** Characters the name takes at the front of a text that doesn't already mention the site. */
export const SMS_BRAND_LENGTH = BRAND.length + 2;
const branded = (message: string) => (message.includes(BRAND) ? message : `${BRAND}: ${message}`);

/** Normalize a US phone number to E.164. Returns null if it is not a plausible number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * Spaces texts out. A number may only send so many a second, and with several people handled at once
 * a run would otherwise go over it. Each send books the next free slot and waits for it.
 */
let nextSlot = 0;
async function turn(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + 1000 / Math.max(0.1, env.smsPerSecond);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export async function sendSms(
  phone: string,
  message: string,
): Promise<{ messageId?: string; dryRun: boolean }> {
  await ready();
  const body = branded(message);
  if (env.smsDryRun) {
    console.log(`[SMS_DRY_RUN] to ${phone}: ${body}`);
    return { dryRun: true };
  }
  await turn();
  if (env.smsProvider === "twilio") return viaTwilio(phone, body);
  const r = await sms().send(
    new SendTextMessageCommand({
      DestinationPhoneNumber: phone,
      MessageBody: body,
      MessageType: "TRANSACTIONAL",
      ...(env.smsOriginationNumber ? { OriginationIdentity: env.smsOriginationNumber } : {}),
    }),
  );
  return { messageId: r.MessageId, dryRun: false };
}

/** Twilio's own code for "this number replied STOP to you". */
const TWILIO_STOPPED = 21610;

async function viaTwilio(phone: string, body: string): Promise<{ messageId?: string; dryRun: boolean }> {
  const { twilioAccountSid: account, twilioKeySid: key, twilioKeySecret: secret, twilioMessagingService: service } = env;
  if (!account || !key || !secret || !service) throw new Error("Twilio is chosen for texts but is not fully configured");
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, MessagingServiceSid: service, Body: body }),
    signal: AbortSignal.timeout(10_000),
  });
  const d = (await r.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
  if (!r.ok) {
    if (d.code === TWILIO_STOPPED) throw new SmsStopped();
    throw new Error(`Twilio ${r.status}${d.code ? ` (${d.code})` : ""}: ${d.message ?? "send refused"}`);
  }
  return { messageId: d.sid, dryRun: false };
}

type Texted = { phone: string; smsStopped?: string; smsStoppedVia?: string };

/**
 * True when a recorded STOP means this person must not be texted now.
 *
 * AWS publishes its STOP list, so the record is kept in step with it (syncAwsStop). Twilio has no
 * list to read and accepts a text to a stopped number before rejecting it, so it tells the site about
 * each STOP and START as it happens (src/app/api/twilio/inbound). Either way the record is obeyed,
 * and a stop made at one company is never lifted by the other.
 */
export function smsBlocked(sub: Texted): boolean {
  return !!sub.smsStopped;
}

/** Brings the record in step with AWS's list. A stop made at Twilio is left alone: AWS wouldn't know of it. */
export async function syncAwsStop(sub: Texted, listed: boolean): Promise<void> {
  if (env.smsProvider !== "aws") return;
  if (listed === !!sub.smsStopped) return;
  if (!listed && sub.smsStoppedVia === "twilio") return;
  await setSmsStopped(sub.phone, listed, "aws");
  sub.smsStopped = listed ? nowIso() : undefined;
  sub.smsStoppedVia = listed ? "aws" : undefined;
}

/**
 * Texts an account holder. If the texting company refuses on the spot because the number replied
 * STOP, that is written down and reported as `stopped`, not as a failure.
 */
export async function textPerson(sub: Texted, number: string, message: string): Promise<{ messageId?: string; dryRun: boolean; stopped?: true }> {
  try {
    return await sendSms(number, message);
  } catch (e) {
    if (!(e instanceof SmsStopped)) throw e;
    if (!sub.smsStopped) {
      await setSmsStopped(sub.phone, true, env.smsProvider);
      sub.smsStopped = nowIso();
      sub.smsStoppedVia = env.smsProvider;
      log.warn("sms_stopped", { who: who(sub.phone), via: env.smsProvider });
    }
    return { dryRun: false, stopped: true };
  }
}

/**
 * STOP replies are handled by AWS, which keeps its own opted-out list and
 * refuses to deliver to those numbers. These two lookups let the site know about
 * it, so it stops trying, records it honestly, and can tell the person how to
 * get texts back (reply START). Twilio offers no such list, so with Twilio both
 * answer "don't know" and the site relies on what Twilio has reported to it.
 */
export async function isOptedOut(phone: string): Promise<boolean> {
  await ready();
  if (env.smsProvider === "twilio") return false; // no list to ask; the site's own record is the answer
  try {
    const r = await sms().send(
      new DescribeOptedOutNumbersCommand({ OptOutListName: OPT_OUT_LIST, OptedOutNumbers: [phone] }),
    );
    return (r.OptedOutNumbers ?? []).some((n) => n.OptedOutNumber === phone);
  } catch (e) {
    // Asking about a number that isn't on the list is answered with "not found".
    if (e instanceof Error && e.name === "ResourceNotFoundException") return false;
    log.warn("optout_check_failed", { err: reason(e) });
    return false; // AWS still enforces the opt-out itself; we just won't know this run
  }
}

/** Every number currently opted out, or null if the list couldn't be read. */
export async function listOptedOut(): Promise<Set<string> | null> {
  await ready();
  if (env.smsProvider === "twilio") return null; // no list to read; Twilio reports each STOP as it happens
  const out = new Set<string>();
  let NextToken: string | undefined;
  try {
    do {
      const r = await sms().send(new DescribeOptedOutNumbersCommand({ OptOutListName: OPT_OUT_LIST, NextToken }));
      for (const n of r.OptedOutNumbers ?? []) if (n.OptedOutNumber) out.add(n.OptedOutNumber);
      NextToken = r.NextToken;
    } while (NextToken);
    return out;
  } catch (e) {
    log.warn("optout_list_failed", { err: reason(e) });
    return null;
  }
}
