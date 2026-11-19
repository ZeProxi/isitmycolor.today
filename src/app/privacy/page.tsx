import { Suspense } from "react";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { PageSkeleton } from "@/components/PageSkeleton";
import { LegalPage } from "@/components/LegalPage";
import { withOperator } from "@/lib/operator";

export default function PrivacyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PrivacyContent />
    </Suspense>
  );
}

async function PrivacyContent() {
  const lang = await getLang();
  const s = t(lang).privacy;
  return <LegalPage title={s.title} updated={s.updated} sections={await withOperator(s.sections, lang, true)} />;
}
