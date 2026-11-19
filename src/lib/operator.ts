import { env } from "./env";
import { ready } from "./config";
import { t, type Lang } from "./i18n";

/**
 * Adds a "Who runs this site" section, second in the list, when an operator is configured.
 * The name, place and contact address come from configuration (OPERATOR_NAME, OPERATOR_LOCATION,
 * OPERATOR_EMAIL), so they are never part of the source.
 *
 * With `contactLast`, the page's closing "Contact" section points to that address too.
 */
export async function withOperator(
  sections: readonly (readonly string[])[],
  lang: Lang,
  contactLast = false,
): Promise<readonly (readonly string[])[]> {
  await ready();
  const s = t(lang).operator;
  const email = env.operatorEmail.trim();
  if (contactLast && email && sections.length) {
    const last = sections[sections.length - 1];
    sections = [...sections.slice(0, -1), [last[0], s.questions(email)]];
  }
  const name = env.operatorName.trim();
  if (!name) return sections;
  const body = s.by(name, env.operatorLocation.trim()) + (email ? s.contact(email) : "");
  return [...sections.slice(0, 1), [s.heading, body], ...sections.slice(1)];
}
