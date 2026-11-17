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
 * Sends an email. Goes through Resend when RESEND_API_KEY is set, otherwise
 * through Amazon SES. Either way EMAIL_FROM must be a sender on a domain
 * verified with that provider.
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
  if (env.resendApiKey) return sendViaResend(to, subject, text, html, replyTo, from, unsubscribeUrl);
  const r = await ses().send(
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
  );
  return { messageId: r.MessageId, dryRun: false };
}

/** Thrown when the email provider refuses because the day's or month's allowance is used up. */
export class EmailQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailQuotaError";
  }
}

async function sendViaResend(
  to: string,
  subject: string,
  text: string,
  html?: string,
  replyTo?: string,
  from?: string,
  unsubscribeUrl?: string,
): Promise<{ messageId?: string; dryRun: boolean }> {
  const request = () =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: from || env.emailFrom,
        to: [to],
        subject,
        text,
        ...(html ? { html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(unsubscribeUrl
          ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  // Resend answers 429 for two different things: too many requests this second (wait a moment and it
  // goes through), or the day's/month's allowance being spent (nothing will go through until it resets).
  for (let attempt = 0; ; attempt++) {
    const res = await request();
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (res.ok) return { messageId: body.id, dryRun: false };
    const quota = res.status === 429 && /quota/i.test(`${body.name ?? ""} ${body.message ?? ""}`);
    if (quota) throw new EmailQuotaError(`Resend: ${body.message ?? body.name ?? "sending allowance used up"}`);
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      continue;
    }
    // Thrown like an SES failure, so callers log it as "failed: ..." the same way.
    throw new Error(`Resend ${res.status}: ${body.message ?? body.name ?? "send failed"}`);
  }
}
