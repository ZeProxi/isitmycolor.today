/** Quick check of the analytics math on a small synthetic history. `npx tsx scripts/analytics-sanity.ts` */
import { computeAnalytics } from "../src/lib/analytics";

const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
const cols = [["green", "orange"], ["green", "blue"], ["red"], ["green"], ["blue", "orange"], ["green", "orange"], ["red", "blue"], ["green"]];
const recs = days.map((d, i) => ({
  sk: d,
  snapshot: {
    date: d,
    dateText: "",
    dayName: "",
    announcement: "",
    colors: cols[i].map((k) => ({ key: k, raw: k, english: k, spanish: "", siteBackground: null })),
    sourceUrl: "",
    fetchedAt: `${d}T13:00:00Z`,
  },
  rawHtml: "",
}));
const a = computeAnalytics(recs, "2026-11-08");
const g = a.colors.find((c) => c.key === "green")!;
console.log("green:", { count: g.count, longestGap: g.longestGap, recentShare: g.recentShare, repeatNextDay: g.repeatNextDay });
console.log("repeat:", a.repeat);
console.log("top pair:", a.pairs[0]);
console.log("per-day histogram:", a.perDayHistogram);
