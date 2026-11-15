import { Suspense } from "react";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { PageSkeleton } from "@/components/PageSkeleton";
import { LegalPage } from "@/components/LegalPage";

export default function TermsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TermsContent />
    </Suspense>
  );
}

async function TermsContent() {
  const s = t(await getLang()).terms;
  return <LegalPage title={s.title} updated={s.updated} sections={s.sections} />;
}
