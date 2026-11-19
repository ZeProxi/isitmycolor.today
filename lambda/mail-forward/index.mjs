// Forwards mail received at the site's contact address to the owner's inbox.
//
// Amazon SES receives the message, stores the raw email in a private bucket, then calls this function.
// The copy that goes out is sent from the site's own address (the only kind SES will send for us), with
// Reply-To set to the original sender so a reply goes to them.
//
// Settings (environment variables, never in this file):
//   MAIL_BUCKET   private bucket the raw messages are stored in
//   MAIL_PREFIX   key prefix inside it, e.g. "inbound-mail/"
//   FORWARD_TO    inbox the mail is forwarded to
//   FORWARD_FROM  address on the site's domain the copy is sent from
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const s3 = new S3Client({});
const ses = new SESv2Client({});

/** Headers that must not be carried over: ours replace them, or they'd fail checks once the mail is re-sent. */
const DROP = ["return-path", "sender", "from", "reply-to", "message-id", "dkim-signature", "authentication-results", "received-spf", "x-ses-[a-z-]+"];

/** Removes a header (including its folded continuation lines) from a raw header block. */
function strip(headers, name) {
  return headers.replace(new RegExp(`^${name}:[^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*\\r?\\n`, "gim"), "");
}

/** Keeps a display name safe to put inside a quoted string. */
const clean = (s) => s.replace(/[\r\n"\\<>]/g, " ").replace(/\s+/g, " ").trim();

export async function handler(event) {
  const { mail, receipt } = event.Records[0].ses;
  const id = mail.messageId;

  // SES has already scanned it. Obvious junk is dropped here; the raw copy stays in the bucket until it expires.
  if (receipt.spamVerdict?.status === "FAIL" || receipt.virusVerdict?.status === "FAIL") {
    console.log(`dropped ${id}: spam=${receipt.spamVerdict?.status} virus=${receipt.virusVerdict?.status}`);
    return { dropped: true };
  }

  const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.MAIL_BUCKET, Key: `${process.env.MAIL_PREFIX}${id}` }));
  const raw = Buffer.from(await obj.Body.transformToByteArray());

  // Split at the first blank line. Headers are rewritten as text; the body is passed through untouched.
  let cut = raw.indexOf("\r\n\r\n");
  let gap = 4;
  if (cut === -1) {
    cut = raw.indexOf("\n\n");
    gap = 2;
  }
  if (cut === -1) throw new Error(`message ${id} has no header/body break`);
  let headers = raw.subarray(0, cut).toString("latin1") + "\r\n";
  const body = raw.subarray(cut + gap);

  for (const name of DROP) headers = strip(headers, name);

  const original = mail.commonHeaders?.replyTo?.[0] || mail.commonHeaders?.from?.[0] || mail.source;
  const who = clean(original.replace(/<[^>]*>/g, "")) || clean(original);
  const from = `"${who} (via isitmycolor.today)" <${process.env.FORWARD_FROM}>`;

  const out = Buffer.concat([
    Buffer.from(`From: ${from}\r\nReply-To: ${original.replace(/[\r\n]/g, " ")}\r\n${headers}\r\n`, "latin1"),
    body,
  ]);

  const r = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.FORWARD_FROM,
      Destination: { ToAddresses: [process.env.FORWARD_TO] },
      Content: { Raw: { Data: out } },
    }),
  );
  console.log(`forwarded ${id} as ${r.MessageId}`);
  return { forwarded: true };
}
