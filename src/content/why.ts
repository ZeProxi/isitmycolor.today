/**
 * The personal "Why this exists" section on the About page.
 *
 * It is intentionally empty in the repository. The deployed site loads the
 * owner's section from the private screenshot bucket (content/why.json plus
 * photos), see src/lib/owner-content.ts. If you fork this, either leave it
 * null, write your own here, or upload your own why.json to your bucket.
 */
import type { Lang } from "@/lib/i18n";

type Text = Record<Lang, string>;

export type Person = {
  name: Text;
  relation: Text;
  dates: Text;
  body: Text;
  /** image URL or path under /public */
  photo: string;
};

export type WhySection = {
  title: Text;
  intro: Text;
  people: Person[];
  /** Optional heading and dedication for the section the people appear in. Defaults come from the site's own wording. */
  memorial?: { title?: Text; intro?: Text };
};

export const WHY: WhySection | null = null;
