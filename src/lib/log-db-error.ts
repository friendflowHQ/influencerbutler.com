// Redacted logging for database (PostgREST/Postgres) errors.
//
// A raw PostgREST error object carries `details`, which on a CHECK-constraint
// failure is "Failing row contains (...)" - every column value of the offending
// row. For the tax tables that means legal name, full address, tin_last4, and
// the events table's client IP would land in Vercel log retention. This logs
// only the non-sensitive diagnostic fields and never the whole object.

type DbErrorShape = {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
};

/** Log a DB error with code/message/hint only - never `details` (may hold row PII). */
export function logDbError(tag: string, error: unknown): void {
  const e = (error ?? {}) as DbErrorShape;
  console.error(tag, {
    code: e.code ?? null,
    message: e.message ?? null,
    hint: e.hint ?? null,
  });
}
