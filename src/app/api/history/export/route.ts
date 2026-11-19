import type { NextRequest } from "next/server";
import { listMonthSnapshots } from "@/lib/dynamo";
import { isAdmin } from "@/lib/admin";

/**
 * GET /api/history/export?month=YYYY-MM -> that month's recorded days as CSV.
 *
 * Owner only, like the Analytics pages. Anyone can look a day up on the History page, which is what the
 * page is for. A ready-made spreadsheet of every day is the raw material for working out a pattern, and
 * random testing shouldn't come with one. Everyone else gets "not found", the same as a page that isn't there.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad month", { status: 400 });
  const days = await listMonthSnapshots(month);
  // The notice text comes from another site. A cell beginning with = + - or @ would be run as a formula
  // by a spreadsheet, so those get a leading apostrophe, which spreadsheets show as plain text.
  const q = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const rows = [
    ["date", "weekday", "colors", "colors_spanish", "notice", "read_at_utc"].join(","),
    ...days.map((d) => {
      const [y, m, dd] = (d.date ?? "").split("-").map(Number);
      const weekday = d.date ? new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : "";
      return [
        d.date ?? "",
        weekday,
        d.colors.map((c) => c.english).join("; "),
        d.colors.map((c) => c.spanish).join("; "),
        d.announcement,
        d.fetchedAt,
      ]
        .map(q)
        .join(",");
    }),
  ];
  return new Response(rows.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="isitmycolor-${month}.csv"`,
      "cache-control": "private, no-store", // owner-only: never held by the CDN for the next visitor
    },
  });
}
