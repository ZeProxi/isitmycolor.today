import { currentAccount } from "./auth";
import { getSubscriber } from "./dynamo";

/** Color keys of the signed-in person, or [] when signed out or anything fails. */
export async function myColors(): Promise<string[]> {
  try {
    const phone = await currentAccount();
    if (!phone) return [];
    return (await getSubscriber(phone))?.colors ?? [];
  } catch {
    return [];
  }
}

/**
 * The same, plus the last day this person saw the once-a-day banner and the date they chose for their
 * alerts to stop (if any), from the same single read.
 * Only reads: the banner is marked as seen by the browser once it is actually on screen.
 */
export async function mineToday(): Promise<{ colors: string[]; momentDate?: string; endDate?: string }> {
  try {
    const phone = await currentAccount();
    if (!phone) return { colors: [] };
    const sub = await getSubscriber(phone);
    return { colors: sub?.colors ?? [], momentDate: (sub as { momentDate?: string } | undefined)?.momentDate, endDate: sub?.prefs?.endDate };
  } catch {
    return { colors: [] };
  }
}
