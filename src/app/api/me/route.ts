import type { NextRequest } from "next/server";
import { currentPhone } from "@/lib/auth";
import { deleteSubscriber, getSubscriber, upsertSubscriber, AGREEMENT_VERSION, type AlertPrefs } from "@/lib/dynamo";
import { normalizeColorKey } from "@/lib/colors";
import { isLang } from "@/lib/i18n";
import { isEmail } from "@/lib/email";
import { deleteAlerts } from "@/lib/alertlog";

/** The signed-in person's alert. All three methods need the session cookie. */

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

/** GET -> { phone, subscriber | null } */
export async function GET() {
  const phone = await currentPhone();
  if (!phone) return unauthorized();
  return Response.json({ phone, subscriber: await getSubscriber(phone), agreementVersion: AGREEMENT_VERSION });
}

/** PUT { colors: string[], lang?: "en"|"es", email?: string } -> create or update the alert */
export async function PUT(req: NextRequest) {
  const phone = await currentPhone();
  if (!phone) return unauthorized();

  let body: { colors?: unknown; lang?: unknown; email?: unknown; prefs?: unknown; agree?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const colors = Array.isArray(body.colors)
    ? Array.from(
        new Set(
          body.colors
            .filter((c): c is string => typeof c === "string")
            .map(normalizeColorKey)
            .filter(Boolean),
        ),
      )
    : [];
  if (colors.length === 0) return Response.json({ error: "no_colors" }, { status: 400 });
  if (colors.length > 10) return Response.json({ error: "too_many_colors" }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && !isEmail(email)) return Response.json({ error: "invalid_email" }, { status: 400 });

  const prefs = parsePrefs(body.prefs);
  if (body.prefs !== undefined && !prefs) return Response.json({ error: "invalid_prefs" }, { status: 400 });

  // A brand-new alert can only be created together with the agreement.
  const agree = body.agree === true;
  const existing = await getSubscriber(phone);
  if (!existing && !agree) return Response.json({ error: "agreement_required" }, { status: 400 });

  const subscriber = await upsertSubscriber({
    phone,
    colors,
    email, // "" clears it
    lang: isLang(body.lang) ? body.lang : undefined,
    prefs: prefs ?? undefined,
    agree,
  });
  return Response.json({ phone, subscriber });
}

/** DELETE -> stop alerts and forget the number */
export async function DELETE() {
  const phone = await currentPhone();
  if (!phone) return unauthorized();
  await Promise.all([deleteSubscriber(phone), deleteAlerts(phone)]);
  return Response.json({ ok: true });
}

function parsePrefs(v: unknown): AlertPrefs | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const mode = o.mode === "daily" ? "daily" : o.mode === "match" ? "match" : null;
  const earliestHour = Number(o.earliestHour);
  if (!mode || !Number.isInteger(earliestHour) || earliestHour < 1 || earliestHour > 12) return null;
  return { mode, includeOfficial: o.includeOfficial === true, earliestHour };
}
