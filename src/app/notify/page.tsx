import { Suspense } from "react";
import { getLang } from "@/lib/lang-server";
import { AlertsFlow } from "@/components/AlertsFlow";
import { PageSkeleton } from "@/components/PageSkeleton";

export default function NotifyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NotifyContent />
    </Suspense>
  );
}

async function NotifyContent() {
  await getLang(); // keeps the page request-scoped like the rest of the app
  return (
    <div className="pt-6 sm:pt-10">
      <AlertsFlow />
    </div>
  );
}
