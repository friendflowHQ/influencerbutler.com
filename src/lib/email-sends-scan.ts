/**
 * Walk a large email_sends window newest-first without OFFSET.
 *
 * OFFSET paging rescans every earlier row per batch, and a (created_at, id)
 * keyset with an OR filter defeats the email_sends_created_at_idx index (the
 * planner sorts the whole window per batch). Paging on created_at alone keeps
 * every batch an index range scan. Rows that share the boundary timestamp
 * (bulk inserts stamp the same now()) are read in a separate eq query so none
 * are skipped or double counted.
 */

type ScanError = { code?: string; message?: string };
type ScanResult<T> = PromiseLike<{ data: T[] | null; error: ScanError | null }>;

export type ScanOutcome = { error: ScanError | null; fetched: number; truncated: boolean };

/**
 * @param page  rows with created_at strictly before `before` (or all when
 *              null), ordered created_at desc, at most `limit` rows.
 * @param ties  rows with created_at exactly `at`, ordered by id, range from..to.
 * @param onRows receives every row exactly once.
 */
export async function scanNewestFirst<T extends { created_at: string }>(
  page: (before: string | null, limit: number) => ScanResult<T>,
  ties: (at: string, from: number, to: number) => ScanResult<T>,
  onRows: (rows: T[]) => void,
  opts: { batch?: number; maxRows?: number } = {},
): Promise<ScanOutcome> {
  const batch = opts.batch ?? 1000;
  const maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY;
  let before: string | null = null;
  let fetched = 0;

  for (;;) {
    const { data, error } = await page(before, batch);
    if (error) return { error, fetched, truncated: false };
    const rows = data ?? [];
    if (rows.length < batch) {
      onRows(rows);
      fetched += rows.length;
      return { error: null, fetched, truncated: false };
    }

    // The batch may have cut a group of same-timestamp rows in half: take the
    // strictly-newer rows now and read the whole boundary group separately.
    const boundary = rows[rows.length - 1].created_at;
    const newer = rows.filter((r) => r.created_at !== boundary);
    onRows(newer);
    fetched += newer.length;

    for (let from = 0; ; from += batch) {
      const tie = await ties(boundary, from, from + batch - 1);
      if (tie.error) return { error: tie.error, fetched, truncated: false };
      const tieRows = tie.data ?? [];
      onRows(tieRows);
      fetched += tieRows.length;
      if (tieRows.length < batch) break;
    }

    before = boundary;
    if (fetched >= maxRows) return { error: null, fetched, truncated: true };
  }
}
