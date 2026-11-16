import type { NextRequest } from "next/server";
import { clearEmail } from "@/lib/dynamo";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

/**
 * GET/POST /api/email/unsubscribe?p=<phone>&t=<token>
 * The link in every alert email, and the RFC 8058 one-click target mail apps use.
 * Stops emails only; texts and push continue until the person changes them.
 */
async function handle(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!verifyUnsubscribe(p, t)) return new Response("This link isn't valid.", { status: 400 });
  await clearEmail(p, "unsubscribe");
  return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
export const GET = handle;
export const POST = handle;

const page = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Emails stopped</title>
<style>body{margin:0;padding:48px 20px;background:#0b1220;color:#eef2ff;font:17px/1.5 system-ui,sans-serif}main{max-width:460px;margin:0 auto}h1{font-size:26px;margin:0 0 8px}p{margin:0 0 10px;color:#c7d0ea}a{color:#fff}</style></head>
<body><main><h1>Email alerts stopped.</h1><p>Texts and app notifications continue. To change those, open <a href="/notify">isitmycolor.today/notify</a>.</p>
<p lang="es" style="margin-top:20px">Las alertas por correo se detuvieron. Los textos y las notificaciones siguen; cámbialos en isitmycolor.today/notify.</p></main></body></html>`;
