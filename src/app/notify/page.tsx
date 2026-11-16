import { Suspense } from "react";
import { getLang } from "@/lib/lang-server";
import { AlertsFlow } from "@/components/AlertsFlow";
import { PageSkeleton } from "@/components/PageSkeleton";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";

export default function NotifyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NotifyContent />
    </Suspense>
  );
}

async function NotifyContent() {
  await getLang(); // keeps the page request-scoped like the rest of the app
  await ready();
  return (
    <div className="pt-6 sm:pt-10">
      <AlertsFlow smsPending={env.smsPending} smsNumber={env.smsOriginationNumber} />
    </div>
  );
}
