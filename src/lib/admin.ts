import { currentSession } from "./auth";
import { emailOf, getSubscriber } from "./dynamo";
import { env } from "./env";
import { ready } from "./config";

/**
 * Whether the signed-in person is the site's owner (or someone the owner has
 * listed). Decided by a verified email address appearing in ADMIN_EMAILS, a
 * comma-separated list kept in configuration, never in the code.
 *
 * Used for the pages that show patterns in when colors are called. Those are
 * the owner's own view of the data and are not published: random testing
 * shouldn't come with a public chart of its past.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await currentSession();
  if (!session) return false;
  await ready();
  const allowed = env.adminEmails;
  if (allowed.length === 0) return false;
  // The account's own verified address wins; before an alert exists, the address proven at sign-in.
  const sub = await getSubscriber(session.id).catch(() => null);
  const email = (sub ? emailOf(sub) : session.contacts.email)?.toLowerCase();
  return !!email && allowed.includes(email);
}
