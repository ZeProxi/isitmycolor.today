import { getDayRecord } from "@/lib/dynamo";

/** GET /day/2026-11-15/source -> downloads the hotline page's HTML exactly as saved that day. */
export async function GET(_req: Request, ctx: RouteContext<"/day/[date]/source">) {
  const { date } = await ctx.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response("Bad date", { status: 400 });
  const rec = await getDayRecord(date);
  if (!rec?.rawHtml) return new Response("No saved page for that day", { status: 404 });
  const stamp = `<!-- Saved by isitmycolor.today from ${rec.snapshot.sourceUrl} at ${rec.snapshot.fetchedAt} (unofficial copy) -->\n`;
  return new Response(stamp + rec.rawHtml, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="wasatch-colors-${date}.html"`,
      "cache-control": "private, max-age=0",
    },
  });
}
