import { env } from "@/lib/env";
import { ready } from "@/lib/config";

/** GET -> the VAPID public key the browser needs to subscribe (public by design). */
export async function GET() {
  await ready();
  if (!env.vapidPublicKey) return Response.json({ error: "push_disabled" }, { status: 404 });
  return Response.json({ key: env.vapidPublicKey });
}
