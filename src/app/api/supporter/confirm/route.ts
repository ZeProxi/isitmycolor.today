import type { NextRequest } from "next/server";
import { getSubscriber } from "@/lib/dynamo";
import { confirmSupporter, textUrl, verifySupporterLink } from "@/lib/supporters";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";

/**
 * /api/supporter/confirm?p=<account>&e=<email>&t=<token>: the link in an invitation.
 * GET only shows a page with a button; alerts start when the button is pressed
 * (a POST), so a mail scanner that opens every link can't accept on someone's behalf.
 */

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;padding:48px 20px;background:#131313;color:#f1f1ee;font:17px/1.5 system-ui,sans-serif}main{max-width:460px;margin:0 auto}h1{font-size:26px;line-height:1.2;margin:0 0 10px}p{margin:0 0 12px;color:#adada7}a{color:#f1f1ee}button{font:600 16px system-ui,sans-serif;background:#edb058;color:#131313;border:0;border-radius:6px;padding:12px 18px;cursor:pointer}.es{margin-top:26px;padding-top:18px;border-top:1px solid #2d2d2b}</style></head>
<body><main>${body}</main></body></html>`;
const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function read(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = q.get("p") ?? "";
  const e = (q.get("e") ?? "").toLowerCase();
  return { p, e, ok: verifySupporterLink("confirm", p, e, q.get("t") ?? "") };
}
const invalid = () => html(page("Link not valid", "<h1>This link isn't valid.</h1><p>Ask the person who invited you to send a new one.</p>"), 400);
const gone = () => html(page("Invitation withdrawn", "<h1>This invitation is no longer active.</h1><p>The person who invited you removed it or stopped their alerts.</p><p class=\"es\" lang=\"es\">Esta invitación ya no está activa.</p>"), 410);

export async function GET(req: NextRequest) {
  const { p, e, ok } = read(req);
  if (!ok) return invalid();
  const sub = await getSubscriber(p);
  if (!sub?.supporters?.some((s) => s.email === e)) return gone();
  const who = esc(sub.name || "Someone");
  return html(
    page(
      "Get color-day alerts?",
      `<h1>Get an email on ${who}'s color days?</h1>
<p>${who} asked isitmycolor.today to email you on the days their color is listed on the Wasatch Behavioral Health UA hotline. That's one short email on those days and nothing else.</p>
<p>You can stop at any time from a link in each email.</p>
<form method="post"><button type="submit">Yes, email me</button></form>
<p style="margin-top:14px">If you don't want this, close this page. You won't hear from us again.</p>
<div class="es" lang="es"><p>${who} pidió que te enviemos un correo los días en que salga su color. Presiona el botón para aceptar. Puedes detenerlo cuando quieras.</p></div>`,
    ),
  );
}

export async function POST(req: NextRequest) {
  const { p, e, ok } = read(req);
  if (!ok) return invalid();
  const sub = await confirmSupporter(p, e);
  if (!sub) return gone();
  const who = esc(sub.name || "them");
  await ready();
  // Texts are their own choice, made by them: offered here and in each email once texting is switched on.
  const texts = env.smsPending ? "" : `<p style="margin-top:22px"><a href="${esc(textUrl(p, e))}">Want a text on those days too?</a></p>`;
  return html(page("You're set", `<h1>You're set.</h1><p>You'll get an email on ${who}'s color days. Every email has a link to stop.</p>${texts}<p class="es" lang="es">Listo. Recibirás un correo en los días de su color. Cada correo trae un enlace para detenerlos.</p>`));
}
