# isitmycolor.today (unofficial UA color checker)

A community-built, open-source mirror of the Wasatch Behavioral Health UA color hotline page
(https://wasatch.org/colors/) with a history calendar and text / email alerts.

**Not affiliated with Wasatch Behavioral Health.** Provided as-is, use at your own risk. It cannot be
used to argue that a color was or was not called. Everyone is still responsible for checking the official
page or calling the hotline at (385) 268-5002.

## What it does

- **Today** – reads the live hotline page and shows the colors as big tiles, plus the hotline notice,
  clinic locations with open/closed status, and the disclaimer.
- **History** – every day the scraper sees is saved to DynamoDB (parsed colors plus a copy of the raw
  page HTML) and shown in a month calendar.
- **Alerts** – sign-up asks how to reach you: text, email, or both. Each one is proven with a 6-digit code
  (no password, no Cognito) before it is used, and either one signs you back in. Then: your colors and the
  agreement. Settings: text/email/this-device channels (add, change or remove any, keeping at least one),
  only on your color days or every day, a link to the official page as captured that morning, an earliest
  time (1 am to 12 pm Mountain Time, default 6 am), and an optional date after which the alert and all its
  records are deleted automatically. One alert per day, with two rare exceptions (a "couldn't read the page"
  notice followed by the real alert, and a correction when a color is added late). Adding a number or email that already has its
  own alert merges the two once its code is entered.
- **Day pages** – `/day/YYYY-MM-DD` shows an **official screenshot** (a headless-Chrome PNG taken by the
  `lambda/screenshot` function and stored in a private S3 bucket) plus a frozen copy of the saved HTML.
  Text-message links point here. The Lambda runs on a schedule (00:30 and 06:00 Mountain) and is also
  invoked the first time the scraper sees a new day.
- **Official** – the real wasatch.org/colors page embedded in an iframe so people can verify for themselves.
- **EN / ES** – the whole UI and the text message are available in English and Spanish.

## Forking this for another hotline or your own site

- The site owner's personal "Why this exists" section on the About page is **not in this repository**.
  The deployed site loads it from a private S3 object (`content/why.json` plus photos in the screenshot
  bucket, see `src/lib/owner-content.ts`). `src/content/why.ts` is `null` here; a fork can leave it
  that way, write its own section there, or upload its own `why.json`.
- `src/lib/resources.ts` holds the Utah-specific help lines on the Resources page. Replace them with
  resources for your area, and verify every number against the organization's own site.
- `src/lib/locations.ts` has the testing sites and hours; `src/lib/scrape.ts` parses the hotline page.
- Everything else (domain, tables, secrets, bucket) is configuration, see `.env.example` and the
  deployment section below.

## Stack

Next.js 16 (App Router, Cache Components), Tailwind v4, DynamoDB, AWS End User Messaging (SMS), SES (email, optional),
EventBridge rule + API destination (cron), SSM Parameter Store (config). Hosted on AWS Amplify.

## Local development

```bash
cp .env.example .env      # then fill in ACCESS_KEY / SECRET_ACCESS_KEY (local dev only)
npm install
npx tsx scripts/create-tables.ts   # one time: creates the two DynamoDB tables
npm run dev                        # http://localhost:3000
```

With `SMS_DRY_RUN=true` (the default in `.env.example`) nothing is actually sent: texts and emails are
printed to the dev server console, and the sign-in code is shown on the page.

`EMAIL_DRY_RUN` and `PUSH_DRY_RUN` override that for email and device notifications, so you can send real
email locally (`EMAIL_DRY_RUN=false` with `EMAIL_FROM` on a domain verified in Amazon SES) while texts stay off.

Useful scripts:

```bash
npx tsx scripts/run-notify.ts            # run the scrape + notify job once
npx tsx scripts/run-notify.ts --force    # ignore "already notified" and texting-window guards
npx tsx scripts/sns-sandbox.ts status    # SMS sandbox status
npx tsx scripts/sns-sandbox.ts add +18015551234      # verify a number while in the sandbox
npx tsx scripts/sns-sandbox.ts verify +18015551234 123456
```

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/colors` | GET | Today's colors, parsed from the live page |
| `/api/history?month=YYYY-MM` | GET | Recorded days for a month (`?date=` returns one day with raw HTML) |
| `/api/known-colors` | GET | Color list for the picker (static list + everything ever seen) |
| `/api/auth/send-code` | POST | `{ phone }` → texts a sign-in code |
| `/api/auth/verify` | POST | `{ phone, code }` → sets the session cookie |
| `/api/auth/signout` | POST | clears the session |
| `/api/me` | GET / PUT / DELETE | the signed-in person's alert (`{ colors, lang, email, prefs }`) |
| `/api/cron/notify` | GET / POST | the scheduled job; needs `Authorization: Bearer $CRON_SECRET` |

## Deploying to Amplify

1. Push this repo to GitHub and connect it in Amplify Hosting (it detects Next.js and uses `amplify.yml`).
2. No access keys in Amplify. The server runs under an IAM **compute role** and reads its config from
   **SSM Parameter Store** at start-up (`src/instrumentation.ts`).
   - Role: `isitmycolor-amplify-compute` (trusts `amplify.amazonaws.com`; allows the two DynamoDB tables,
     `sns:Publish` for SMS, `ses:SendEmail`, and reading `/isitmycolor/*` parameters). In the Amplify app
     go to App settings → IAM roles → Compute role and pick it.
   - Parameters under `/isitmycolor/`: `CRON_SECRET` and `SESSION_SECRET` (SecureString), `SITE_URL`,
     `SUBSCRIBERS_TABLE`, `HISTORY_TABLE`, `SMS_DRY_RUN`, `NOTIFY_START_HOUR`, `NOTIFY_END_HOUR`, and
     optionally `EMAIL_FROM`. Change a value in SSM, then redeploy (or wait for the next cold start).
   - The only Amplify environment variables needed: `APP_AWS_REGION=us-west-2` and `SSM_PREFIX=/isitmycolor`.
     (Amplify reserves names starting with `AWS_`, which is why the app reads `APP_AWS_REGION`.)
3. Custom domain (`isitmycolor.today`):
   - In Route 53, create a public hosted zone for `isitmycolor.today`, then copy its four NS records to
     the registrar's nameserver settings (if the domain was bought through Route 53 this is automatic).
   - In the Amplify app go to Hosting → Custom domains → Add domain, pick `isitmycolor.today`. Because the
     hosted zone is in the same account, Amplify creates the ACM certificate, the validation CNAME, and the
     A/AAAA alias records itself. Keep the default `www` → root redirect, or remove `www` if you don't want it.
   - Set the Amplify env var `SITE_URL=https://isitmycolor.today` so text-message links use the real domain.
   - Nameserver changes can take up to 48 hours to propagate; the Amplify domain status page shows progress.
4. Once the site has a URL, create the schedule:
   `npx tsx scripts/create-schedule.ts https://isitmycolor.today`
   It creates an EventBridge rule (`wasatch-colors-notify`) that runs every 20 minutes, 06:00-00:40 UTC,
   which covers midnight through about 5 pm Mountain time year-round. The page resets at midnight, so early
   runs capture the new day for the calendar. Each person picks their earliest text hour (1 am to 12 pm,
   default 6 am); the global window `NOTIFY_START_HOUR`..`NOTIFY_END_HOUR` (default 1 am to 9 pm) is a
   floor on top of that.
5. SMS: two texting companies are supported and `SMS_PROVIDER` picks one: `aws` (the default, AWS End
   User Messaging from a registered toll-free number) or `twilio` (set `TWILIO_ACCOUNT_SID`,
   `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_MESSAGING_SERVICE_SID` and `TWILIO_NUMBER`; use a
   restricted API key that can only create and read messages). Changing the setting moves every text
   across. Nothing falls back by itself, because each company keeps its own STOP list. On AWS, texts
   are sent with End User Messaging, not SNS (SNS accepts a text for a registered toll-free number and
   then fails to deliver it). The account starts in the sandbox (texts only reach
   verified numbers). Request production access in the End User Messaging SMS console. US carriers may also require a
   registered origination number or toll-free number for reliable delivery.
6. Email (optional), through Amazon SES: verify a sender identity, set `EMAIL_FROM`, and request SES
   production access.
7. Note: these text messages can't carry images (no MMS), which is why "include the official page" sends a
   link to the saved copy instead of a screenshot. A real screenshot (headless Chrome in a Lambda) could be
   added later for the email channel.

## Support people

A signed-in person can invite up to two others (a sponsor, a parent, a case manager) to get an email on their
color days. Adding someone only sends an invitation; alerts start after that person presses the button on the
page it links to (`/api/supporter/confirm`), so nobody is emailed alerts without agreeing. Every alert they get
has a stop link (`/api/supporter/stop`), the holder can remove them at any time, and they are stored on the
holder's row, so they are deleted with the alert. See `src/lib/supporters.ts`.

Once texting is live (`SMS_PENDING` off), an accepted support person is also offered texts, on the page they
land on after accepting and in each email. They enter their own number at `/api/supporter/text` and prove it
with a code; the holder never supplies or sees it. While `SMS_PENDING` is on, the offer is hidden and the page
says texts aren't available yet.

## Push notifications and the flyer

- The site is installable (manifest + icons). Signed-in people can turn on **web push** for a device from
  the Alerts card; it's free and needs no carrier. On iPhone it only works after Add to Home Screen.
  Keys: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (SecureString), `VAPID_SUBJECT` in SSM; generate with
  `npx web-push generate-vapid-keys`.
- `/flyer` is a printable one-page handout with a QR code to sign-up (Ctrl+P).

## Owner-only pages

`/analytics` and the statistics on each color's page (how often it is listed, weekdays, gaps, every date) are
shown only to a signed-in person whose verified email is in `ADMIN_EMAILS` (comma-separated, in SSM). Everyone
else gets a not-found page for Analytics and a plain color page. Patterns in past calls are kept off the
public site on purpose.

## Abuse and cost controls

Every public endpoint is either cached at the CDN (`/api/colors`, `/api/history*`, `/api/known-colors`)
or rate limited in DynamoDB (`src/lib/ratelimit.ts`): sign-in codes are capped per phone, per address
(10/hour) and site-wide (300/day); code checks per address (30/hour); the contact form per address
(3/hour) and site-wide (50/day), with a honeypot and a required reply-to email. Session-only endpoints (`/api/me*`, `/api/push*`) need
the signed cookie; the cron needs its bearer secret. The contact form delivers to `CONTACT_EMAIL`, sent from `CONTACT_FROM` (both SSM; the latter falls back to `EMAIL_FROM`).
For a real flood, turn on the Amplify firewall (WAF) with a rate-based rule.

Each send attempt is logged per phone (`ALERT#<phone>` rows in the history table, one-year TTL) so a
signed-in person can see their own alert history on the Alerts tab. It is readable only with the session
cookie and is deleted with the subscription.

## New colors

The scraper keeps whatever the hotline prints. A color missing from the built-in list in `src/lib/colors.ts`
is saved with its names and the page's own background (`META` / `color#<key>`), offered in the picker, and
drawn with that look everywhere, so nothing needs a code change when the hotline adds one.

## Email bounces, complaints, and unsubscribes

Every alert email carries a one-click unsubscribe link (`/api/email/unsubscribe`, HMAC-signed per phone)
and `List-Unsubscribe` headers. SES publishes bounces and complaints through the configuration set in
`SES_CONFIGURATION_SET` to an SNS topic (`SES_EVENTS_TOPIC_ARN`), whose HTTPS subscription hits
`/api/ses/events`; the handler verifies the SNS signature and topic, then removes the address from the
subscriber on a permanent bounce or a complaint. The person sees why on their Alerts card and can add an
address again. Setup: `scripts/setup-ses-events.sh`.

## STOP and START

Carrier opt-outs are enforced by the texting company. Twilio reports each STOP and START to `/api/twilio/inbound` (set as the messaging service's incoming-message webhook, with `TWILIO_WEBHOOK_SECRET` as its password), and the site records it; a stop made at one company is never lifted by the other. With AWS End User Messaging, the site reads its opted-out list on every notify run
and before any sign-in code or test text, marks those subscribers `smsStopped`, skips their text channel
(email and push continue), shows "stopped" in their alert history, and tells them to text START to the
toll-free number to get texts back. The compute role needs `sns:ListPhoneNumbersOptedOut` and
`sns:CheckIfPhoneNumberIsOptedOut`.

## Knowing when it breaks

Subscribers are told too. If today's page still can't be read by 8 am Mountain (`UNREADABLE_NOTICE_HOUR`), or
by a person's own earliest time if that is later, each subscriber gets one "we couldn't read today's colors,
check the official page" message, so that silence is never mistaken for "not my color". It doesn't count as
their daily alert: if the page comes good later, the real alert still goes.

The daily job checks its own result. If the hotline page can't be fetched, parses to no colors, or still
shows yesterday's date after 7 am Mountain, the owner gets one text and one email per problem per day
(`OWNER_PHONE` and `OWNER_EMAIL` in SSM). Subscribers are never contacted by this. See `src/lib/health.ts`.

## Logs

Server code logs through `src/lib/log.ts`: one line of JSON per event, with `lvl` (`error`, `warn`, `info`),
`evt`, and a few fields. On Amplify these land in the app's CloudWatch log group (`/aws/amplify/<app id>`).

No phone number or email address is written. A person appears only as `who`, a short one-way tag, and error
text has any contact blanked. To find one person's lines, get their tag and search for it:

```bash
npx tsx scripts/log-tag.ts someone@example.com    # prints e.g. u:1a2b3c4d
```

Then in CloudWatch Logs Insights, on the app's log group:

```
fields @timestamp, lvl, evt, ch, why, err
| filter who = "u:1a2b3c4d"
| sort @timestamp desc
```

Drop the `who` filter and use `filter lvl = "error"` to see everything that broke. What gets logged:

- `unhandled`: any error a page or route didn't catch, with the path (never its query string).
- `code_send_failed`, `code_not_sent`, `code_rejected`: sign-in codes that failed, were refused (rate limit,
  allowance), or were typed wrong or too late.
- `alert_failed`, `alert_undelivered`: one channel failing for one person, and nothing reaching them at all.
  The failure reason is also kept on the person's alert record (`why`), which is never sent to the browser.
- `notify_run`: one line per scheduled run with counts, so "did the 7:20 run happen?" has an answer.
- `alert_created`, `alerts_ended` (with how: the Alerts page, an email link, or the end date), `emails_stopped`,
  `alerts_combined`, `ending_reminder_sent`: the life of one person's alert.
- `supporter_accepted`, `supporter_stopped`, `supporter_text_on` / `_off`, `supporter_link_refused`: what a
  support person did. `who` on these is the person being supported; a support person's own address or
  number is never written.

Recommended set-up, done once in AWS (none of it is in this repo): a retention period on the log groups
(this site uses 90 days, which the Privacy page states), a metric filter on `{ $.lvl = "error" }`, and an
alarm on that metric that emails the owner.

## Answering "you never alerted me"

Three things are kept so a complaint about a missed alert can be checked against what happened:

- every alert attempted for a person, channel by channel, with their color list at that moment and the
  reason for any failure;
- every change to their colors, with the time;
- for each day nothing was sent because none of their colors was listed: their list and the page's at the
  moment that was decided.

All of it is kept a year at most and deleted when the person stops their alert. To read it:

```bash
npx tsx scripts/lookup.ts someone@example.com 2026-11-19
```

That prints their colors and changes, what the hotline page listed that day and when it was read, and what
was done for them. It prints one person's details to your screen, so mind where the output goes.

## Busy mornings

One alert run handles several people at once (`NOTIFY_PARALLEL`, default 8) and stops starting new sends
after `NOTIFY_BUDGET_SECONDS` (default 20), which must stay under the host's limit for one request. Whoever
is left is untouched and gets their alert on the next run; the run's log line counts them as `left`. Texts
are spaced to the sending number's allowed rate (`SMS_PER_SECOND`, default 3, a US toll-free number's limit),
so texts are what caps a run: about 60 in 20 seconds. Emails and device notifications are not held to that.

Only one run sends at a time (`src/lib/runlock.ts`). The scheduler calls again when a run takes longer than
it waits, and two runs on the same list would both send to people neither had marked yet.

## Ending reminder

Someone who set an end date gets one reminder the day before it (or on the day, if they chose it that
late), on every channel they have, saying their alerts are about to stop and their data will be deleted,
and how to keep them. Choosing a different date makes them due a reminder again.

## Winding the site down

Set the SSM parameter `/isitmycolor/SITE_SUNSET` to `true` and redeploy. Every page then shows a notice
pointing to wasatch.org/colors and the daily job stops sending texts and emails (it keeps recording
history). `/isitmycolor/SITE_NOTICE` shows a one-line amber notice on every page without stopping alerts,
for things like "texts delayed this morning".

## Contributing

Issues and pull requests are welcome. Keep the tone of the site: short, plain, non-judgmental.
Anything that touches the Resources page must be verified against the organization's own website,
and anything that touches texting must keep the opt-in, STOP handling, and one-text-per-day rules.
Run `npx tsc --noEmit` and `npx eslint src scripts` before opening a PR.

## License

MIT, see `LICENSE`. The owner's About section and portraits are not part of the repository.

## Data

Turn on point-in-time recovery and deletion protection for both tables, and versioning on the screenshot
bucket; none of it is on by default and together it costs next to nothing at this size:

```bash
aws dynamodb update-continuous-backups --table-name <table> --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
aws dynamodb update-table --table-name <table> --deletion-protection-enabled
aws s3api put-bucket-versioning --bucket <bucket> --versioning-configuration Status=Enabled
```

Recovery keeps 35 days, so a deleted subscriber stays restorable for that long; the privacy page says so.

- `wasatch-colors-subscribers` (pk `phone`): `{ phone, sms?, email?, emailVerified?, colors[], lang, prefs, active, lastNotifiedDate }`.
  `phone` is the account id, not necessarily a number: an E.164 phone, `email:<address>`, or `acct:<uuid>`.
  The contacts are `sms` and `email`; read them with `smsOf()` / `emailOf()` in `src/lib/dynamo.ts`.
  One-time codes live in the same table under `otp#<phone or email>`.
- `wasatch-colors-history` (pk `pk`, sk `sk`): `DAY#date` records `{ snapshot, rawHtml, firstSeenAt }`
  and a `META / known-colors` set.
