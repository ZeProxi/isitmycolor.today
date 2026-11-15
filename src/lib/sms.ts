import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { env, awsCredentials } from "./env";
import { ready } from "./config";

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
