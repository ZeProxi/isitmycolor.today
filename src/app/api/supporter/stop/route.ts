import type { NextRequest } from "next/server";
import { removeSupporter, verifySupporterLink } from "@/lib/supporters";

/**
 * /api/supporter/stop?p=<account>&e=<email>&t=<token>: the "stop these emails" link in
 * every alert a support person gets. GET asks first; POST removes them (which is
 * also what a mail app's one-click unsubscribe sends).
 */

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;padding:48px 20px;background:#131313;color:#f1f1ee;font:17px/1.5 system-ui,sans-serif}main{max-width:460px;margin:0 auto}h1{font-size:26px;line-height:1.2;margin:0 0 10px}p{margin:0 0 12px;color:#adada7}a{color:#f1f1ee}button{font:600 16px system-ui,sans-serif;background:#edb058;color:#131313;border:0;border-radius:6px;padding:12px 18px;cursor:pointer}.es{margin-top:26px;padding-top:18px;border-top:1px solid #2d2d2b}</style></head>
<body><main>${body}</main></body></html>`;
const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

function read(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = q.get("p") ?? "";
  const e = (q.get("e") ?? "").toLowerCase();
  return { p, e, ok: verifySupporterLink("stop", p, e, q.get("t") ?? "") };
}
const invalid = () => html(page("Link not valid", "<h1>This link isn't valid.</h1>"), 400);

export async function GET(req: NextRequest) {
  if (!read(req).ok) return invalid();
  return html(
    page(
      "Stop these emails?",
      `<h1>Stop these emails?</h1><p>You won't get any more color-day emails for this person.</p>
<form method="post"><button type="submit">Stop the emails</button></form>
<p class="es" lang="es">Presiona el botón para dejar de recibir estos correos.</p>`,
    ),
  );
}

export async function POST(req: NextRequest) {
  const { p, e, ok } = read(req);
  if (!ok) return invalid();
  await removeSupporter(p, e);
  return html(page("Emails stopped", `<h1>Emails stopped.</h1><p>You won't hear from us again about this person.</p><p class="es" lang="es">Los correos se detuvieron.</p>`));
}
