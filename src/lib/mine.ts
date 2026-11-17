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
