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
  /** Public URL of the deployed site, no trailing slash. Used for links in texts/emails. */
  get siteUrl() {
    return read("SITE_URL").replace(/\/$/, "");
  },
  /** Verified SES sender, e.g. "My Color <alerts@yourdomain.com>". Empty disables email. */
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
  /** "true" logs SMS/email instead of sending (handy in dev). */
  get smsDryRun() {
    return read("SMS_DRY_RUN") === "true";
  },
};

/** Explicit credentials for local dev, or undefined to let the SDK default chain (IAM role) take over. */
export function awsCredentials() {
  if (env.accessKeyId && env.secretAccessKey) {
    return { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey };
  }
  return undefined;
}
