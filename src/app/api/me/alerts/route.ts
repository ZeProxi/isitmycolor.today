import { currentPhone } from "@/lib/auth";
import { listAlerts } from "@/lib/alertlog";

/** GET -> the signed-in person's alert history, newest first. Session cookie required. */
export async function GET() {
  const phone = await currentPhone();
  if (!phone) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ alerts: await listAlerts(phone) }, { headers: { "cache-control": "private, no-store" } });
}
