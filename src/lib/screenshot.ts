import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { env, awsCredentials } from "./env";
import { ready } from "./config";
import { log, reason } from "./log";

let _s3: S3Client | null = null;
function s3() {
  if (!_s3) _s3 = new S3Client({ region: env.region, credentials: awsCredentials() });
  return _s3;
}

export type Screenshot = { url: string; downloadUrl: string; capturedAt: string | null };

/**
 * A short-lived signed link to the official screenshot for a day, or null when
 * there isn't one. The bucket is private; the link lasts an hour.
 */
export async function getScreenshot(date: string): Promise<Screenshot | null> {
  await ready();
  if (!env.screenshotBucket) return null;
  const Key = `screenshots/${date}.png`;
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: env.screenshotBucket, Key }));
    const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: env.screenshotBucket, Key }), { expiresIn: 3600 });
    const downloadUrl = await getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: env.screenshotBucket,
        Key,
        ResponseContentDisposition: `attachment; filename="wasatch-colors-${date}.png"`,
      }),
      { expiresIn: 3600 },
    );
    return { url, downloadUrl, capturedAt: head.Metadata?.["captured-at"] ?? head.LastModified?.toISOString() ?? null };
  } catch {
    return null;
  }
}

/** Fire-and-forget: ask the screenshot Lambda to capture the page now. */
export async function requestScreenshot(): Promise<boolean> {
  await ready();
  if (!env.screenshotFunction) return false;
  try {
    const lambda = new LambdaClient({ region: env.region, credentials: awsCredentials() });
    await lambda.send(new InvokeCommand({ FunctionName: env.screenshotFunction, InvocationType: "Event", Payload: Buffer.from("{}") }));
    return true;
  } catch (e) {
    log.error("screenshot_failed", { err: reason(e) });
    return false;
  }
}
