import { SNSClient, PublishCommand, CheckIfPhoneNumberIsOptedOutCommand, ListPhoneNumbersOptedOutCommand } from "@aws-sdk/client-sns";
import { env, awsCredentials } from "./env";
import { ready } from "./config";
import { log, reason } from "./log";

let _sns: SNSClient | null = null;
function sns() {
  if (!_sns) _sns = new SNSClient({ region: env.region, credentials: awsCredentials() });
  return _sns;
}

/** Normalize a US phone number to E.164. Returns null if it is not a plausible number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
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
  const r = await sns().send(
    new PublishCommand({
      PhoneNumber: phone,
      Message: message,
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
        ...(env.smsOriginationNumber
          ? { "AWS.MM.SMS.OriginationNumber": { DataType: "String", StringValue: env.smsOriginationNumber } }
          : {}),
      },
    }),
  );
  return { messageId: r.MessageId, dryRun: false };
}

/**
 * STOP replies are handled by Amazon SNS, which keeps its own opted-out list and
 * refuses to deliver to those numbers. These two lookups let the site know about
 * it, so it stops trying, records it honestly, and can tell the person how to
 * get texts back (reply START).
 */
export async function isOptedOut(phone: string): Promise<boolean> {
  await ready();
  try {
    const r = await sns().send(new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber: phone }));
    return !!r.isOptedOut;
  } catch (e) {
    log.warn("optout_check_failed", { err: reason(e) });
    return false; // SNS still enforces the opt-out itself; we just won't know this run
  }
}

/** Every number currently opted out, or null if the list couldn't be read. */
export async function listOptedOut(): Promise<Set<string> | null> {
  await ready();
  const out = new Set<string>();
  let nextToken: string | undefined;
  try {
    do {
      const r = await sns().send(new ListPhoneNumbersOptedOutCommand({ nextToken }));
      for (const n of r.phoneNumbers ?? []) out.add(n);
      nextToken = r.nextToken;
    } while (nextToken);
    return out;
  } catch (e) {
    log.warn("optout_list_failed", { err: reason(e) });
    return null;
  }
}
