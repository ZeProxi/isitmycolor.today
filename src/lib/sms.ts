import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
  DescribeOptedOutNumbersCommand,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { env, awsCredentials } from "./env";
import { ready } from "./config";
import { log, reason } from "./log";

/**
 * Texts go out through AWS End User Messaging, the service the toll-free number
 * and its approval belong to. The older SNS route accepts a text for this number
 * and then fails to deliver it.
 */
let _sms: PinpointSMSVoiceV2Client | null = null;
function sms() {
  if (!_sms) _sms = new PinpointSMSVoiceV2Client({ region: env.region, credentials: awsCredentials() });
  return _sms;
}

/** The list AWS adds a number to when it replies STOP, and takes it off on START. */
const OPT_OUT_LIST = "Default";

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
  if (env.smsDryRun) {
    console.log(`[SMS_DRY_RUN] to ${phone}: ${message}`);
    return { dryRun: true };
  }
  await turn();
  const r = await sms().send(
    new SendTextMessageCommand({
      DestinationPhoneNumber: phone,
      MessageBody: message,
      MessageType: "TRANSACTIONAL",
      ...(env.smsOriginationNumber ? { OriginationIdentity: env.smsOriginationNumber } : {}),
    }),
  );
  return { messageId: r.MessageId, dryRun: false };
}

/**
 * STOP replies are handled by AWS, which keeps its own opted-out list and
 * refuses to deliver to those numbers. These two lookups let the site know about
 * it, so it stops trying, records it honestly, and can tell the person how to
 * get texts back (reply START).
 */
export async function isOptedOut(phone: string): Promise<boolean> {
  await ready();
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
