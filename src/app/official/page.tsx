import { Suspense } from "react";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { OfficialFrame } from "@/components/OfficialFrame";
import { HOTLINE_URL } from "@/lib/locations";
import { PageSkeleton } from "@/components/PageSkeleton";

export default function OfficialPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OfficialContent />
    </Suspense>
  );
}

async function OfficialContent() {
  const s = t(await getLang());
  return (
    <div className="space-y-6 pt-6 sm:pt-10">
      <div>
        <h1 className="text-4xl font-bold sm:text-5xl">{s.officialPage.title}</h1>
        <p className="mt-3 max-w-prose text-fg-muted">{s.officialPage.intro}</p>
      </div>
      <OfficialFrame url={HOTLINE_URL} openLabel={s.officialPage.open} reloadLabel={s.officialPage.reload} />
    </div>
  );
}
