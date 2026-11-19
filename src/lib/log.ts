import { createHash } from "node:crypto";

/**
 * Server log lines someone can actually search: one line of JSON each, with a
 * level, an event name, and a few fields. On Amplify they land in CloudWatch.
 *
 * Rule: no phone number or email address is ever written. A person is named
 * only by `who()`, a short one-way tag, and error text passes through
 * `reason()`, which blanks out any contact a provider echoed back.
 *
 *   error  something broke and someone was affected (these are counted and alarmed on)
 *   warn   refused or degraded, usually by design (wrong code, rate limit, a dead device)
 *   info   a normal event worth having a record of (each alert run)
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

function write(lvl: "info" | "warn" | "error", evt: string, fields: Fields = {}) {
  const line = JSON.stringify({ lvl, evt, ...fields });
  if (lvl === "error") console.error(line);
  else if (lvl === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (evt: string, fields?: Fields) => write("info", evt, fields),
  warn: (evt: string, fields?: Fields) => write("warn", evt, fields),
  error: (evt: string, fields?: Fields) => write("error", evt, fields),
};

/**
 * Short tag for an account id, phone number or email address. The same person
 * gets the same tag every time, so their lines can be found, but the tag can't
 * be read back into a contact. `npx tsx scripts/log-tag.ts <contact>` prints it.
 */
export function who(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase().replace(/^email:/, "");
  return `u:${createHash("sha256").update(key).digest("hex").slice(0, 8)}`;
}

/** An error as one short line, with any email address or phone number in it blanked. */
export function reason(e: unknown): string {
  const raw = e instanceof Error ? (e.name && e.name !== "Error" ? `${e.name}: ${e.message}` : e.message) : String(e);
  return raw
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/\+\d{8,15}|(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "<number>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
