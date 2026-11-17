import type { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth";
import { contactsOf, deleteSubscriber, getSubscriber, upsertSubscriber, AGREEMENT_VERSION, type AlertPrefs } from "@/lib/dynamo";
import { normalizeColorKey } from "@/lib/colors";
import { isLang } from "@/lib/i18n";
import { deleteAlerts } from "@/lib/alertlog";
import { forHolder, supportingFor } from "@/lib/supporters";
import { todayIsoMountain } from "@/lib/dates";

/** The signed-in person's alert. All three methods need the session cookie. */

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

/** GET -> { id, contacts, subscriber | null } */
export async function GET() {
  const session = await currentSession();
  if (!session) return unauthorized();
  const subscriber = await getSubscriber(session.id);
  return Response.json({
    id: session.id,
    // before the alert exists, the contacts are the ones proven in this browser
    contacts: subscriber ? contactsOf(subscriber) : session.contacts,
    subscriber: forHolder(subscriber),
    supporting: !subscriber && session.contacts.email ? await supportingFor(session.contacts.email).catch(() => []) : [],
    agreementVersion: AGREEMENT_VERSION,
  });
}

/** PUT { colors: string[], lang?: "en"|"es", prefs?, agree? } -> create or update the alert */
export async function PUT(req: NextRequest) {
  const session = await currentSession();
  if (!session) return unauthorized();

  let body: { colors?: unknown; lang?: unknown; prefs?: unknown; agree?: unknown };
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

  const prefs = parsePrefs(body.prefs);
  if (body.prefs !== undefined && !prefs) return Response.json({ error: "invalid_prefs" }, { status: 400 });

  // A brand-new alert can only be created together with the agreement, and needs somewhere to send to.
  const agree = body.agree === true;
  const existing = await getSubscriber(session.id);
  if (!existing && !agree) return Response.json({ error: "agreement_required" }, { status: 400 });
  if (!existing && !session.contacts.sms && !session.contacts.email) return Response.json({ error: "no_contact" }, { status: 400 });

  const subscriber = await upsertSubscriber({
    phone: session.id,
    colors,
    lang: isLang(body.lang) ? body.lang : undefined,
    prefs: prefs ?? undefined,
    agree,
    contacts: session.contacts,
  });
  return Response.json({ id: session.id, contacts: contactsOf(subscriber), subscriber: forHolder(subscriber) });
}

/** DELETE -> stop alerts and forget the number and email */
export async function DELETE() {
  const session = await currentSession();
  if (!session) return unauthorized();
  await Promise.all([deleteSubscriber(session.id), deleteAlerts(session.id)]);
  return Response.json({ ok: true });
}

function parsePrefs(v: unknown): AlertPrefs | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const mode = o.mode === "daily" ? "daily" : o.mode === "match" ? "match" : null;
  const earliestHour = Number(o.earliestHour);
  if (!mode || !Number.isInteger(earliestHour) || earliestHour < 1 || earliestHour > 12) return null;
  // Optional auto-stop date: a real calendar day, today or later, at most five years out.
  let endDate: string | undefined;
  if (o.endDate !== undefined && o.endDate !== null && o.endDate !== "") {
    if (typeof o.endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.endDate)) return null;
    const d = new Date(`${o.endDate}T12:00:00Z`);
    const today = todayIsoMountain();
    const max = `${Number(today.slice(0, 4)) + 5}${today.slice(4)}`;
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== o.endDate || o.endDate < today || o.endDate > max) return null;
    endDate = o.endDate;
  }
  return { mode, includeOfficial: o.includeOfficial === true, earliestHour, endDate };
}
