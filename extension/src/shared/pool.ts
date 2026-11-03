// Run `worker` over `items` with at most `limit` in flight at once. Pure
// scheduling, no Chrome APIs, unit-tested. Used by the "Scan videos" buttons so
// several background product tabs hydrate side by side instead of one at a time.
//
// - Items are started in order; `shouldStop` is checked before each start, so a
//   Stop click or a robot check halts new work while in-flight items finish.
// - Runners are staggered by `staggerMs` on first start so the tabs do not all
//   open in the same instant.
// - A worker that throws is the caller's problem: workers are expected to catch
//   their own errors (a rejected worker would abort the whole pool).

export type PoolOptions = {
  limit: number;
  staggerMs?: number;
  shouldStop?: () => boolean;
};

export async function runPool<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<void>,
  { limit, staggerMs = 0, shouldStop = () => false }: PoolOptions,
): Promise<void> {
  let next = 0;
  const runner = async (slot: number): Promise<void> => {
    if (slot > 0 && staggerMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, slot * staggerMs));
    }
    while (next < items.length && !shouldStop()) {
      const index = next;
      next += 1;
      await worker(items[index] as T, index);
    }
  };
  const runners = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: runners }, (_, slot) => runner(slot)));
}
