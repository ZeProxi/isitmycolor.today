import { Suspense } from "react";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { PageSkeleton } from "@/components/PageSkeleton";
import { LegalPage } from "@/components/LegalPage";

export default function PrivacyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PrivacyContent />
    </Suspense>
  );
}

async function PrivacyContent() {
  const s = t(await getLang()).privacy;
  return <LegalPage title={s.title} updated={s.updated} sections={s.sections} />;
}
