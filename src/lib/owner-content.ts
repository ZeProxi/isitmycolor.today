import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, awsCredentials } from "./env";
import { ready } from "./config";
import type { WhySection } from "@/content/why";

/**
 * The site owner's personal About section, loaded from the private bucket at
 * content/why.json (photos beside it). It is deliberately not in the repository,
 * so forks and clones don't carry it. Missing or unreadable -> null, and the
 * About page simply omits the section.
 */
export async function loadOwnerWhy(): Promise<WhySection | null> {
  await ready();
  if (!env.screenshotBucket) return null;
  const s3 = new S3Client({ region: env.region, credentials: awsCredentials() });
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: env.screenshotBucket, Key: "content/why.json" }));
    const text = await obj.Body?.transformToString();
    if (!text) return null;
    const why = JSON.parse(text) as WhySection;
    // photos are private objects; hand the page one-hour signed links
    for (const p of why.people) {
      p.photo = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.screenshotBucket, Key: p.photo }), { expiresIn: 3600 });
    }
    return why;
  } catch {
    return null;
  }
}
