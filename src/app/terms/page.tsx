import { Suspense } from "react";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { PageSkeleton } from "@/components/PageSkeleton";
import { LegalPage } from "@/components/LegalPage";
import { withOperator } from "@/lib/operator";

export default function TermsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TermsContent />
    </Suspense>
  );
}

async function TermsContent() {
  const lang = await getLang();
  const s = t(lang).terms;
  return <LegalPage title={s.title} updated={s.updated} sections={await withOperator(s.sections, lang)} />;
}
