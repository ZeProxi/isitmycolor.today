import { cookies, headers } from "next/headers";
import { LANG_COOKIE, isLang, type Lang } from "./i18n";

/**
 * Language for this request: the cookie set by the toggle, else the browser's
 * Accept-Language, else English. Reads request data, so call it inside a
 * Suspense boundary (the layout's Shell already does).
 */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^es\b|,\s*es\b/i.test(accept) ? "es" : "en";
}
