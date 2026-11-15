import { Suspense } from "react";
import { TodayColors, TodayColorsSkeleton } from "@/components/TodayColors";
import { Locations } from "@/components/Locations";

export default function HomePage() {
  return (
    <div className="space-y-12 pt-6 sm:pt-10">
      <Suspense fallback={<TodayColorsSkeleton />}>
        <TodayColors />
      </Suspense>

      <Suspense>
        <Locations />
      </Suspense>
    </div>
  );
}
