import { normalizePhone } from "./sms";
import { isEmail } from "./email";

/**
 * A way to reach someone: a mobile number (texts) or an email address.
 * Either one, once proven with a one-time code, signs a person in, and an
 * alert can have one or both.
 */
export type ContactKind = "sms" | "email";
export type Contact = { kind: ContactKind; value: string };
export type Contacts = { sms?: string; email?: string };

/** Reads `{ phone }` or `{ email }` from a request body. Null when neither is usable. */
export function parseContact(body: { phone?: unknown; email?: unknown }): Contact | null {
  if (typeof body.phone === "string" && body.phone.trim()) {
    const phone = normalizePhone(body.phone);
    return phone ? { kind: "sms", value: phone } : null;
  }
  if (typeof body.email === "string" && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    return isEmail(email) && email.length <= 254 ? { kind: "email", value: email } : null;
  }
  return null;
}

/** The account id a brand-new person gets when they first verify this contact. */
export function derivedId(c: Contact): string {
  return c.kind === "sms" ? c.value : `email:${c.value}`;
}
