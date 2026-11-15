/** Placeholder shown for the few ms while a page reads the language cookie and its data. */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-8 pt-6 sm:pt-10">
      <div>
        <div className="h-10 w-64 rounded bg-white/10 sm:h-12" />
        <div className="mt-4 h-4 w-80 max-w-full rounded bg-white/8" />
      </div>
      <div className="glass h-64 rounded-3xl" />
    </div>
  );
}
