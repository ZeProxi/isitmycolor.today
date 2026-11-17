import type { NextRequest } from "next/server";
import { clearEmail } from "@/lib/dynamo";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

/**
 * /api/email/unsubscribe?p=<account>&t=<token>: the link in every alert email.
 *
 * GET only shows a page with a button. Mail scanners open every link in a
 * message, and if opening it were enough, a scanner could silently switch off
 * someone's alerts. The emails stop on POST: the button here, or the RFC 8058
 * one-click request a mail app sends when the person presses its own
 * "unsubscribe". Stops emails only; texts and notifications continue.
 */
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;padding:48px 20px;background:#131313;color:#f1f1ee;font:17px/1.5 system-ui,sans-serif}main{max-width:460px;margin:0 auto}h1{font-size:26px;line-height:1.2;margin:0 0 10px}p{margin:0 0 12px;color:#adada7}a{color:#f1f1ee}button{font:600 16px system-ui,sans-serif;background:#edb058;color:#131313;border:0;border-radius:6px;padding:12px 18px;cursor:pointer}.es{margin-top:26px;padding-top:18px;border-top:1px solid #2d2d2b}</style></head>
<body><main>${body}</main></body></html>`;
const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

function read(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  return { p, ok: verifyUnsubscribe(p, req.nextUrl.searchParams.get("t") ?? "") };
}
const invalid = () => html(page("Link not valid", "<h1>This link isn't valid.</h1>"), 400);

export async function GET(req: NextRequest) {
  if (!read(req).ok) return invalid();
  return html(
    page(
      "Stop these emails?",
      `<h1>Stop these emails?</h1><p>You won't get alert emails any more. Texts and device notifications continue.</p>
<form method="post"><button type="submit">Stop the emails</button></form>
<p style="margin-top:14px">Changed your mind? Close this page and nothing changes.</p>
<p class="es" lang="es">Presiona el botón para dejar de recibir las alertas por correo. Los textos y las notificaciones siguen.</p>`,
    ),
  );
}

export async function POST(req: NextRequest) {
  const { p, ok } = read(req);
  if (!ok) return invalid();
  await clearEmail(p, "unsubscribe");
  return html(
    page(
      "Emails stopped",
      `<h1>Email alerts stopped.</h1><p>Texts and device notifications continue. To turn emails back on, open <a href="/notify">isitmycolor.today/notify</a> and verify your address again.</p>
<p class="es" lang="es">Las alertas por correo se detuvieron. Los textos y las notificaciones siguen; para reactivarlas, abre isitmycolor.today/notify.</p>`,
    ),
  );
}
