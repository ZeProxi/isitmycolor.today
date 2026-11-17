/**
 * The shared look of every email the site sends: the same near-black page,
 * amber accent and logo as the website, built from tables and inline styles
 * because that is what mail apps reliably render.
 */
const INK = "#131313";
const PANEL = "#1b1b1a";
const LINE = "#2d2d2b";
const FG = "#f1f1ee";
const MUTED = "#adada7";
const FAINT = "#85857f";
export const EMAIL_ACCENT = "#edb058";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Always the live site: images in an email have to be reachable from the reader's mail app.
const LOGO = "https://isitmycolor.today/icons/icon-192.png";

export const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export const emailText = { fg: FG, muted: MUTED, faint: FAINT, line: LINE, panel: PANEL, font: FONT };

/**
 * Wraps content in the header (logo and site name) and footer.
 * `preheader` is the grey preview line mail apps show beside the subject.
 * `footer` is extra HTML above the standing "not affiliated" line.
 */
export function emailShell(opts: { lang: "en" | "es"; preheader: string; body: string; footer?: string }): string {
  const name = opts.lang === "es" ? "Alertas UA Wasatch" : "Wasatch UA Alerts";
  const unofficial =
    opts.lang === "es"
      ? "Herramienta comunitaria no oficial. No está afiliada a Wasatch Behavioral Health. Confirma siempre en wasatch.org/colors o llamando al (385) 268-5002."
      : "Unofficial community tool. Not affiliated with Wasatch Behavioral Health. Always confirm at wasatch.org/colors or by calling (385) 268-5002.";
  return `<!doctype html>
<html lang="${opts.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(name)}</title>
</head>
<body style="margin:0;padding:0;background:${INK};color:${FG};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${INK}">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${INK}">
<tr><td align="center" style="padding:28px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td style="padding:0 0 22px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:12px"><img src="${LOGO}" width="44" height="44" alt="" style="display:block;border:0;border-radius:8px"></td>
        <td style="font:600 17px/1.2 ${FONT};color:${FG}">${esc(name)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${PANEL};border:1px solid ${LINE};border-radius:8px;padding:26px 24px">
${opts.body}
    </td></tr>
    <tr><td style="padding:18px 4px 0;font:12px/1.55 ${FONT};color:${FAINT}">
      ${opts.footer ? `<p style="margin:0 0 10px">${opts.footer}</p>` : ""}
      <p style="margin:0">${esc(unofficial)}</p>
      <p style="margin:10px 0 0"><a href="https://isitmycolor.today" style="color:${MUTED}">isitmycolor.today</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** The sign-in code email: one job, so the code is the biggest thing on the page. */
export function codeEmail(code: string, lang: "en" | "es"): { subject: string; text: string; html: string } {
  const s =
    lang === "es"
      ? {
          subject: `${code} es tu código de Alertas UA Wasatch`,
          title: "Tu código",
          lead: "Escríbelo en la página para continuar.",
          expires: "Vale por 10 minutos y solo se puede usar una vez.",
          ignore: "Si no lo pediste, ignora este correo. No pasa nada sin el código.",
          text: `${code} es tu código de isitmycolor.today. Vence en 10 minutos.`,
        }
      : {
          subject: `${code} is your Wasatch UA Alerts code`,
          title: "Your sign-in code",
          lead: "Enter it on the page to continue.",
          expires: "Good for 10 minutes, and it only works once.",
          ignore: "If you didn't ask for this, ignore this email. Nothing happens without the code.",
          text: `${code} is your isitmycolor.today sign-in code. It expires in 10 minutes.`,
        };
  const body = `      <p style="margin:0;font:700 22px/1.2 ${FONT};color:${FG}">${esc(s.title)}</p>
      <p style="margin:8px 0 0;font:15px/1.5 ${FONT};color:${MUTED}">${esc(s.lead)}</p>
      <p style="margin:22px 0 0;padding:18px 12px;background:${INK};border:1px solid ${LINE};border-left:4px solid ${EMAIL_ACCENT};border-radius:6px;text-align:center;font:700 38px/1 'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;letter-spacing:10px;color:${FG}">${esc(code)}</p>
      <p style="margin:18px 0 0;font:14px/1.5 ${FONT};color:${MUTED}">${esc(s.expires)}</p>`;
  return {
    subject: s.subject,
    text: `${s.text}\n\n${s.ignore}`,
    html: emailShell({ lang, preheader: s.expires, body, footer: esc(s.ignore) }),
  };
}

/** The invitation a support person gets. They receive nothing else unless they accept on the linked page. */
export function supporterInviteEmail(name: string, lang: "en" | "es", confirm: string): { subject: string; text: string; html: string } {
  const s =
    lang === "es"
      ? {
          subject: `${name} quiere que recibas sus alertas de color`,
          title: `${name} te invitó`,
          lead: `${name} usa isitmycolor.today para saber qué días sale su color en la línea UA de Wasatch Behavioral Health, y pidió que tú también recibas un correo esos días.`,
          what: "Es un correo corto en los días de su color y nada más. Puedes detenerlo cuando quieras.",
          button: "Ver la invitación",
          ignore: "Si no quieres recibirlos, ignora este correo. No te escribiremos de nuevo.",
        }
      : {
          subject: `${name} would like you to get their color-day alerts`,
          title: `${name} invited you`,
          lead: `${name} uses isitmycolor.today to know which days their color is listed on the Wasatch Behavioral Health UA hotline, and asked for you to get an email on those days too.`,
          what: "That's one short email on their color days and nothing else. You can stop at any time.",
          button: "See the invitation",
          ignore: "If you don't want these, ignore this email. We won't write to you again.",
        };
  const body = `      <p style="margin:0;font:700 22px/1.2 ${FONT};color:${FG}">${esc(s.title)}</p>
      <p style="margin:10px 0 0;font:15px/1.55 ${FONT};color:${MUTED}">${esc(s.lead)}</p>
      <p style="margin:10px 0 0;font:15px/1.55 ${FONT};color:${MUTED}">${esc(s.what)}</p>
      <p style="margin:22px 0 0"><a href="${esc(confirm)}" style="display:inline-block;background:${EMAIL_ACCENT};color:#131313;border-radius:6px;padding:12px 18px;font:600 15px/1 ${FONT};text-decoration:none">${esc(s.button)}</a></p>`;
  return {
    subject: s.subject,
    text: `${s.lead}\n\n${s.what}\n\n${s.button}: ${confirm}\n\n${s.ignore}`,
    html: emailShell({ lang, preheader: s.what, body, footer: esc(s.ignore) }),
  };
}
