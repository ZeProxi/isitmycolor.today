import type { NextRequest } from "next/server";
import { currentAccount } from "@/lib/auth";
import { setAlertLang } from "@/lib/dynamo";
import { isLang } from "@/lib/i18n";

/**
 * POST { lang: "en" | "es" } -> { saved: boolean }. Called when the signed-in person flips the EN / ES
 * switch, so their texts, emails and notifications follow the language they read the site in. Without
 * this the alert language only changed when they re-saved their alert settings.
 */
export async function POST(req: NextRequest) {
  const id = await currentAccount();
  if (!id) return Response.json({ saved: false }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { lang?: unknown } | null;
  if (!isLang(body?.lang)) return Response.json({ error: "invalid_lang" }, { status: 400 });
  return Response.json({ saved: await setAlertLang(id, body.lang) }, { headers: { "cache-control": "private, no-store" } });
}
