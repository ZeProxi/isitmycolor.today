import type { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth";
import { emailOf, getSubscriber } from "@/lib/dynamo";
import { isEmail, sendEmail, EmailQuotaError } from "@/lib/email";
import { supporterInviteEmail } from "@/lib/email-layout";
import { confirmUrl, removeSupporter, saveSupporters, supportersForHolder, MAX_SUPPORTERS, type Supporter } from "@/lib/supporters";
import { allow } from "@/lib/ratelimit";
import { isLang } from "@/lib/i18n";
import { nowIso } from "@/lib/dates";

/**
 * The signed-in person's support people.
 * POST { email, name } -> invite someone (or re-send their invitation). They get
 *   nothing further until they accept on the page the invitation links to.
 * DELETE ?email= -> remove them.
 */
export async function POST(req: NextRequest) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { email?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  // The name is shown to the supporter, so keep it short and plain (no links or markup to abuse).
  const name = typeof body.name === "string" ? body.name.replace(/[<>"\\/:@]|https?|www\./gi, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
  if (!isEmail(email) || email.length > 254) return Response.json({ error: "invalid_email" }, { status: 400 });
  if (!name) return Response.json({ error: "name_required" }, { status: 400 });

  const sub = await getSubscriber(session.id);
  if (!sub) return Response.json({ error: "no_alert" }, { status: 400 });
  if (emailOf(sub) === email) return Response.json({ error: "own_email" }, { status: 400 });
  const list: Supporter[] = sub.supporters ?? [];
  const existing = list.find((s) => s.email === email);
  if (!existing && list.length >= MAX_SUPPORTERS) return Response.json({ error: "too_many" }, { status: 400 });
  // Invitations are email to someone who hasn't asked for it: keep them rare.
  if (!(await allow(`invite:${session.id}`, 4, 86400))) return Response.json({ error: "rate_limited" }, { status: 429 });

  const next: Supporter[] = existing ? list : [...list, { email, status: "invited", invitedAt: nowIso() }];
  await saveSupporters(session.id, next, name);

  if (existing?.status !== "active") {
    const lang = isLang(sub.lang) ? sub.lang : "en";
    const mail = supporterInviteEmail(name, lang, await confirmUrl(sub, email));
    try {
      const r = await sendEmail(email, mail.subject, mail.text, mail.html);
      if (r.skipped) throw new Error(r.skipped);
    } catch (e) {
      if (!existing) await removeSupporter(session.id, email); // don't leave an invitation nobody received
      if (e instanceof EmailQuotaError) return Response.json({ error: "quota" }, { status: 503 });
      return Response.json({ error: "send_failed" }, { status: 502 });
    }
  }
  return Response.json({ ok: true, name, supporters: supportersForHolder({ supporters: next }) });
}

export async function DELETE(req: NextRequest) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });
  await removeSupporter(session.id, email);
  const sub = await getSubscriber(session.id);
  return Response.json({ ok: true, supporters: sub ? supportersForHolder(sub) : [] });
}
