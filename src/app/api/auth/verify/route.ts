import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { parseContact, derivedId, type Contact, type Contacts } from "@/lib/contact";
import { verifyCode, makeSessionToken, sessionCookieOptions, currentSession, SESSION_COOKIE, type Session } from "@/lib/auth";
import { contactsOf, findAccountByContact, getSubscriber, mergeAccounts, setContact, type Subscriber } from "@/lib/dynamo";
import { deleteAlerts } from "@/lib/alertlog";
import { allow, clientIp } from "@/lib/ratelimit";
import { forHolder, supportingFor } from "@/lib/supporters";

/**
 * POST { phone | email, code } -> proves the person holds that contact.
 *
 * Signed out: signs them in, as the account that already has the contact or as a
 * new one. Signed in: links the contact to their account. If it belonged to
 * another account, entering its code is the proof of ownership, so the two are
 * merged into one.
 */
export async function POST(req: NextRequest) {
  let body: { phone?: unknown; email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const contact = parseContact(body);
  const code = (typeof body.code === "string" ? body.code : "").replace(/\D/g, "");
  if (!contact || code.length !== 6) return Response.json({ error: "wrong" }, { status: 400 });
  if (!(await allow(`verify:ip:${clientIp(req)}`, 30, 3600))) return Response.json({ error: "too_many" }, { status: 429 });

  const r = await verifyCode(contact.value, code);
  if (!r.ok) return Response.json({ error: r.error }, { status: 401 });

  const session = await currentSession();
  const consentAt = contact.kind === "sms" ? r.consentAt : undefined;
  const out = session ? await link(session, contact, consentAt) : await signIn(contact);

  // Until the alert row exists, the moment they agreed to texts rides in the signed session.
  (await cookies()).set(SESSION_COOKIE, makeSessionToken(out.id, out.contacts, consentAt ?? session?.smsConsentAt), sessionCookieOptions());
  const subscriber = await getSubscriber(out.id);
  // Someone with no alert of their own who is a support person for somebody: tell the page, so it can say so.
  const supporting = !subscriber && out.contacts.email ? await supportingFor(out.contacts.email).catch(() => []) : [];
  return Response.json({ ok: true, id: out.id, contacts: subscriber ? contactsOf(subscriber) : out.contacts, subscriber: forHolder(subscriber), merged: out.merged, supporting });
}

type Outcome = { id: string; contacts: Contacts; merged: boolean };

async function signIn(contact: Contact): Promise<Outcome> {
  const contacts: Contacts = { [contact.kind]: contact.value };
  const account = await findAccountByContact(contact);
  if (account) return { id: account.phone, contacts, merged: false };
  // New person. Their id comes from the contact, unless a row already sits there
  // (someone who started with this number or address and later replaced it).
  const id = (await getSubscriber(derivedId(contact))) ? `acct:${randomUUID()}` : derivedId(contact);
  return { id, contacts, merged: false };
}

async function link(session: Session, contact: Contact, consentAt?: string): Promise<Outcome> {
  const contacts: Contacts = { ...session.contacts, [contact.kind]: contact.value };
  const me = await getSubscriber(session.id);
  const other = await findAccountByContact(contact);

  if (other && me && other.phone !== me.phone) {
    await mergeAccounts(me, other);
    await deleteAlerts(other.phone);
    await setContact(me.phone, contact, consentAt);
    return { id: me.phone, contacts, merged: true };
  }
  if (other && !me) {
    // Still signing up, and the second contact already has an alert: carry on as that account.
    await addMissing(other, session.contacts, session.smsConsentAt);
    return { id: other.phone, contacts, merged: true };
  }
  if (me) {
    await setContact(me.phone, contact, consentAt);
    return { id: me.phone, contacts, merged: false };
  }
  return { id: session.id, contacts, merged: false }; // no alert yet: remembered in the cookie until it's created
}

/** Give an existing account the contacts this session proved, where it has none of that kind. */
async function addMissing(account: Subscriber, proven: Contacts, smsConsentAt?: string) {
  const has = contactsOf(account);
  if (proven.sms && !has.sms) await setContact(account.phone, { kind: "sms", value: proven.sms }, smsConsentAt);
  if (proven.email && !has.email) await setContact(account.phone, { kind: "email", value: proven.email });
}
