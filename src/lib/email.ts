import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env, awsCredentials } from "./env";
import { ready } from "./config";

let _ses: SESv2Client | null = null;
function ses() {
  if (!_ses) _ses = new SESv2Client({ region: env.region, credentials: awsCredentials() });
  return _ses;
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Sends a plain-text email through Amazon SES. Needs EMAIL_FROM to be a verified
 * identity in SES; while SES is in its sandbox, recipients must be verified too.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  replyTo?: string,
  from?: string,
): Promise<{ messageId?: string; dryRun: boolean; skipped?: string }> {
  await ready();
  if (!env.emailFrom) return { dryRun: false, skipped: "EMAIL_FROM not set" };
  if (env.smsDryRun) {
    console.log(`[EMAIL_DRY_RUN] to ${to}: ${subject}\n${text}`);
    return { dryRun: true };
  }
  const r = await ses().send(
    new SendEmailCommand({
      FromEmailAddress: from || env.emailFrom,
      Destination: { ToAddresses: [to] },
      ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: text, Charset: "UTF-8" },
            ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
          },
        },
      },
    }),
  );
  return { messageId: r.MessageId, dryRun: false };
}
