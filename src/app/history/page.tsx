import { Suspense } from "react";
import { connection } from "next/server";
import { listMonthSnapshots } from "@/lib/dynamo";
import { todayIsoMountain, monthOf } from "@/lib/dates";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { myColors } from "@/lib/mine";
import { HistoryCalendar } from "@/components/HistoryCalendar";
import { PageSkeleton } from "@/components/PageSkeleton";

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HistoryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HistoryContent({ searchParams }: { searchParams: PageProps<"/history">["searchParams"] }) {
  await connection();
  const lang = await getLang();
  const s = t(lang).history;
  const sp = await searchParams;
  const today = todayIsoMountain();
  const requested = typeof sp.month === "string" ? sp.month : "";
  const month = /^\d{4}-\d{2}$/.test(requested) ? requested : monthOf(today);

  let days: Awaited<ReturnType<typeof listMonthSnapshots>> = [];
  let error: string | null = null;
  let mine: string[] = [];
  try {
    [days, mine] = await Promise.all([listMonthSnapshots(month), myColors()]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-8 pt-6 sm:pt-10">
      <div>
        <h1 className="text-4xl font-bold sm:text-5xl">{s.title}</h1>
        <p className="mt-3 max-w-prose text-fg-muted">{s.intro}</p>
      </div>
      {error && (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-danger">
          {s.loadFailed} {error}
        </p>
      )}
      <HistoryCalendar month={month} days={days} today={today} lang={lang} mine={mine} />
    </div>
  );
}
