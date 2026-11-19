/**
 * Runs `work` over every item, `width` at a time, and waits for all of it.
 *
 * Alerts used to go out one person after another, so the time a run took grew with every sign-up. A
 * request on the host only gets so long, and the scheduler stops waiting sooner than that. Handling a
 * few people at once keeps a busy morning inside one run.
 *
 * `work` must not throw: it is expected to record its own failures, as the alert code does.
 */
export async function pooled<T>(items: T[], width: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, items.length)) }, lane));
}
