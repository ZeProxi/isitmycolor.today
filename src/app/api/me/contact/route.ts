import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { currentSession, makeSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { contactsOf, getSubscriber, removeContact } from "@/lib/dynamo";
import { forHolder } from "@/lib/supporters";

/**
 * DELETE /api/me/contact?kind=sms|email -> stop using that channel and forget it.
 * An alert always keeps at least one of the two; to drop both, stop the alert.
 * (Adding or replacing a contact goes through /api/auth/send-code and /verify,
 * since it has to be proven with a code first.)
 */
export async function DELETE(req: NextRequest) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "sms" && kind !== "email") return Response.json({ error: "invalid_kind" }, { status: 400 });

  const sub = await getSubscriber(session.id);
  if (!sub) return Response.json({ error: "no_alert" }, { status: 400 });
  const has = contactsOf(sub);
  if (!has[kind]) return Response.json({ error: "not_set" }, { status: 400 });
  if (!has[kind === "sms" ? "email" : "sms"]) return Response.json({ error: "last_contact" }, { status: 409 });

  await removeContact(session.id, kind);
  const subscriber = await getSubscriber(session.id);
  const contacts = subscriber ? contactsOf(subscriber) : {};
  (await cookies()).set(SESSION_COOKIE, makeSessionToken(session.id, contacts), sessionCookieOptions());
  return Response.json({ ok: true, contacts, subscriber: forHolder(subscriber) });
}
