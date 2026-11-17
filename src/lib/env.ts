/**
 * Central place for configuration.
 *
 * Every field is a getter, so values are read at call time rather than at import
 * time. That matters because on Amplify the config arrives from SSM Parameter
 * Store during server start-up (see src/instrumentation.ts), after modules load.
 *
 * Credentials: locally, ACCESS_KEY / SECRET_ACCESS_KEY from .env. On Amplify
 * those are unset, so awsCredentials() returns undefined and the SDK's default
 * chain picks up the IAM compute role (key + secret + session token).
 */
const read = (name: string, fallback = ""): string => process.env[name] ?? fallback;

export const env = {
  get region() {
    return read("APP_AWS_REGION") || read("AWS_REGION") || "us-west-2";
  },
  /** Local-dev keys only. Never read AWS_ACCESS_KEY_ID here: in Lambda that comes with a session token the SDK must also see. */
  get accessKeyId() {
    return read("ACCESS_KEY") || undefined;
  },
  get secretAccessKey() {
    return read("SECRET_ACCESS_KEY") || undefined;
  },
  get subscribersTable() {
    return read("SUBSCRIBERS_TABLE", "wasatch-colors-subscribers");
  },
  get historyTable() {
    return read("HISTORY_TABLE", "wasatch-colors-history");
  },
  /** Shared secret the scheduler sends to /api/cron/notify. */
  get cronSecret() {
    return read("CRON_SECRET");
  },
  /** Signs session cookies. Falls back to CRON_SECRET so one secret is enough to start. */
  get sessionSecret() {
    return read("SESSION_SECRET") || read("CRON_SECRET");
  },
  get sourceUrl() {
    return read("COLORS_SOURCE_URL", "https://wasatch.org/colors/");
  },
  timeZone: "America/Denver",
  /** Global texting window in Mountain time (24h). Each person also picks their own earliest hour (1-12). */
  get notifyStartHour() {
    return Number(read("NOTIFY_START_HOUR", "1"));
  },
  get notifyEndHour() {
    return Number(read("NOTIFY_END_HOUR", "21"));
  },
  /**
   * Mountain-time hour after which, if today's page still can't be read, subscribers are told so
   * (so that silence is never mistaken for "not my color").
   */
  get unreadableNoticeHour() {
    return Number(read("UNREADABLE_NOTICE_HOUR", "8"));
  },
  /** Verified email addresses allowed to see the owner-only pages (Analytics, per-color statistics). */
  get adminEmails(): string[] {
    return read("ADMIN_EMAILS")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  /**
   * How many non-alert emails (sign-in codes, invitations, contact-form messages) may go out per
   * UTC day, site-wide. Kept well under the email provider's daily allowance so nothing a visitor
   * can trigger crowds out alerts.
   */
  get emailCodeDailyCap() {
    return Number(read("EMAIL_CODE_DAILY_CAP", "40"));
  },
  /** Public URL of the deployed site, no trailing slash. Used for links in texts/emails. */
  get siteUrl() {
    return read("SITE_URL").replace(/\/$/, "");
  },
  /** Resend API key. When set, email goes out through Resend; otherwise through Amazon SES. */
  get resendApiKey() {
    return read("RESEND_API_KEY");
  },
  /** Signing secret of the Resend webhook ("whsec_..."); /api/resend/events rejects everything without it. */
  get resendWebhookSecret() {
    return read("RESEND_WEBHOOK_SECRET");
  },
  /** Verified sender (a Resend or SES domain), e.g. "My Color <alerts@yourdomain.com>". Empty disables email. */
  get emailFrom() {
    return read("EMAIL_FROM");
  },
  /** Private S3 bucket holding screenshots/<date>.png taken by the screenshot Lambda. */
  get screenshotBucket() {
    return read("SCREENSHOT_BUCKET");
  },
  /** Name of that Lambda, so a new day's first scrape can trigger a capture. */
  get screenshotFunction() {
    return read("SCREENSHOT_FUNCTION");
  },
  /** E.164 toll-free/10DLC number texts are sent from. Empty lets SNS pick. */
  get smsOriginationNumber() {
    return read("SMS_ORIGINATION_NUMBER");
  },
  /** Optional one-line notice shown at the top of every page (e.g. "Texts delayed today"). */
  get siteNotice() {
    return read("SITE_NOTICE");
  },
  /** "true" winds the site down: a notice on every page points to the official site and no alerts are sent. */
  get siteSunset() {
    return read("SITE_SUNSET") === "true";
  },
  /** "true" while the texting number awaits carrier approval: sign-up shows a notice and pauses. */
  get smsPending() {
    return read("SMS_PENDING") === "true";
  },
  /** SES configuration set that publishes bounces/complaints (set as the identity default too). */
  get sesConfigSet() {
    return read("SES_CONFIGURATION_SET");
  },
  /** SNS topic those events arrive from; /api/ses/events accepts nothing else. */
  get sesEventsTopicArn() {
    return read("SES_EVENTS_TOPIC_ARN");
  },
  /** Where the About page's contact form delivers. Empty disables the form. */
  get contactEmail() {
    return read("CONTACT_EMAIL");
  },
  /** Sender for contact-form mail, e.g. "Site contact <form@yourdomain.com>". Falls back to EMAIL_FROM. */
  get contactFrom() {
    return read("CONTACT_FROM") || read("EMAIL_FROM");
  },
  /** Web push (VAPID). Empty public key disables push. */
  get vapidPublicKey() {
    return read("VAPID_PUBLIC_KEY");
  },
  get vapidPrivateKey() {
    return read("VAPID_PRIVATE_KEY");
  },
  get vapidSubject() {
    return read("VAPID_SUBJECT");
  },
  /** "true" logs texts, push and (unless EMAIL_DRY_RUN says otherwise) email instead of sending. Handy in dev. */
  get smsDryRun() {
    return read("SMS_DRY_RUN") === "true";
  },
  /** Device notifications' own switch, like EMAIL_DRY_RUN. Follows SMS_DRY_RUN when unset. */
  get pushDryRun() {
    const v = read("PUSH_DRY_RUN");
    return v ? v === "true" : read("SMS_DRY_RUN") === "true";
  },
  /** Email's own switch, for sending real email while texts stay off. Follows SMS_DRY_RUN when unset. */
  get emailDryRun() {
    const v = read("EMAIL_DRY_RUN");
    return v ? v === "true" : read("SMS_DRY_RUN") === "true";
  },
};

/** Explicit credentials for local dev, or undefined to let the SDK default chain (IAM role) take over. */
export function awsCredentials() {
  if (env.accessKeyId && env.secretAccessKey) {
    return { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey };
  }
  return undefined;
}
