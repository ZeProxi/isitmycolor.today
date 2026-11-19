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
 * Sends an email through Amazon SES. EMAIL_FROM must be a sender on a domain
 * verified there.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  replyTo?: string,
  from?: string,
  unsubscribeUrl?: string,
): Promise<{ messageId?: string; dryRun: boolean; skipped?: string }> {
  await ready();
  if (!env.emailFrom) return { dryRun: false, skipped: "EMAIL_FROM not set" };
  if (env.emailDryRun) {
    console.log(`[EMAIL_DRY_RUN] to ${to}: ${subject}\n${text}`);
    return { dryRun: true };
  }
  const r = await ses()
    .send(
    new SendEmailCommand({
      FromEmailAddress: from || env.emailFrom,
      ...(env.sesConfigSet ? { ConfigurationSetName: env.sesConfigSet } : {}),
      Destination: { ToAddresses: [to] },
      ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
      Content: {
        Simple: {
          ...(unsubscribeUrl
            ? {
                Headers: [
                  { Name: "List-Unsubscribe", Value: `<${unsubscribeUrl}>` },
                  { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
                ],
              }
            : {}),
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: text, Charset: "UTF-8" },
            ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
          },
        },
      },
    }),
    )
    .catch((e: unknown) => {
      // The day's sending allowance is spent: nothing goes through until it resets, so callers say so.
      if ((e as { name?: string }).name === "LimitExceededException") throw new EmailQuotaError(`SES: ${e instanceof Error ? e.message : "sending allowance used up"}`);
      throw e;
    });
  return { messageId: r.MessageId, dryRun: false };
}

/** Thrown when the email provider refuses because the day's or month's allowance is used up. */
export class EmailQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailQuotaError";
  }
}
