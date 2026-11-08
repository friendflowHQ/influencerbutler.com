/**
 * Summary: tiny in-memory Supabase stand-in for the Funnels v2 plumbing tests
 *   (onboarding-profile, plan-level, funnel-activation, funnel-assignments and
 *   the app-trial intake route). Supports the query shapes those files use:
 *   select/eq/is/maybeSingle, update/eq/is[/select], insert, upsert
 *   (onConflict + ignoreDuplicates)[/select]. Can simulate a missing table
 *   (PGRST205) or missing columns (42703) to exercise the fallbacks.
 * Dependencies: none (not a test file itself).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Filter = { col: string; op: "eq" | "is"; value: unknown };
type Result = { data: unknown; error: { code: string; message: string } | null };

export type FakeDbOptions = {
  tables?: Record<string, Row[]>;
  missingTables?: string[];
  missingColumns?: Record<string, string[]>;
};

export type FakeDb = {
  db: SupabaseClient;
  tables: Record<string, Row[]>;
  calls: { table: string; op: string; payload?: unknown }[];
};

export function makeFakeDb(opts: FakeDbOptions = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(opts.tables ?? {})) tables[k] = v.map((r) => ({ ...r }));
  const calls: FakeDb["calls"] = [];
  const missingTables = new Set(opts.missingTables ?? []);

  function schemaError(table: string, cols: string[]): Result["error"] {
    if (missingTables.has(table)) return { code: "PGRST205", message: `missing table ${table}` };
    const missing = opts.missingColumns?.[table] ?? [];
    const bad = cols.find((c) => missing.includes(c));
    return bad ? { code: "42703", message: `column ${bad} does not exist` } : null;
  }

  function rowsOf(table: string): Row[] {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  }

  function matches(row: Row, filters: Filter[]): boolean {
    return filters.every((f) =>
      f.op === "eq" ? row[f.col] === f.value : (row[f.col] ?? null) === f.value,
    );
  }

  function pick(row: Row, cols: string[]): Row {
    const out: Row = {};
    for (const c of cols) out[c] = row[c] ?? null;
    return out;
  }

  function from(table: string) {
    return {
      select(colStr: string) {
        const cols = colStr.split(",").map((c) => c.trim());
        const filters: Filter[] = [];
        const run = (): Result => {
          const err = schemaError(table, cols);
          if (err) return { data: null, error: err };
          return { data: rowsOf(table).filter((r) => matches(r, filters)).map((r) => pick(r, cols)), error: null };
        };
        const q = {
          eq(col: string, value: unknown) {
            filters.push({ col, op: "eq", value });
            return q;
          },
          is(col: string, value: unknown) {
            filters.push({ col, op: "is", value });
            return q;
          },
          async maybeSingle(): Promise<Result> {
            calls.push({ table, op: "select", payload: colStr });
            const r = run();
            if (r.error) return r;
            const list = r.data as Row[];
            return { data: list[0] ?? null, error: null };
          },
          then(resolve: (r: Result) => unknown) {
            calls.push({ table, op: "select", payload: colStr });
            return Promise.resolve(run()).then(resolve);
          },
        };
        return q;
      },

      update(patch: Row) {
        const filters: Filter[] = [];
        let returning: string[] | null = null;
        const run = (): Result => {
          calls.push({ table, op: "update", payload: patch });
          const err = schemaError(table, Object.keys(patch));
          if (err) return { data: null, error: err };
          const hit = rowsOf(table).filter((r) => matches(r, filters));
          for (const r of hit) Object.assign(r, patch);
          return { data: returning ? hit.map((r) => pick(r, returning as string[])) : null, error: null };
        };
        const q = {
          eq(col: string, value: unknown) {
            filters.push({ col, op: "eq", value });
            return q;
          },
          is(col: string, value: unknown) {
            filters.push({ col, op: "is", value });
            return q;
          },
          select(colStr: string) {
            returning = colStr.split(",").map((c) => c.trim());
            return q;
          },
          then(resolve: (r: Result) => unknown) {
            return Promise.resolve(run()).then(resolve);
          },
        };
        return q;
      },

      insert(payload: Row | Row[]) {
        const list = Array.isArray(payload) ? payload : [payload];
        calls.push({ table, op: "insert", payload });
        const err = schemaError(table, list.flatMap((r) => Object.keys(r)));
        if (!err) for (const r of list) rowsOf(table).push({ ...r });
        return Promise.resolve({ data: null, error: err });
      },

      upsert(payload: Row, o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        let returning: string[] | null = null;
        const run = (): Result => {
          calls.push({ table, op: "upsert", payload });
          const err = schemaError(table, Object.keys(payload));
          if (err) return { data: null, error: err };
          const keys = (o.onConflict ?? "id").split(",").map((k) => k.trim());
          const existing = rowsOf(table).find((r) => keys.every((k) => r[k] === payload[k]));
          let written: Row | null = null;
          if (existing) {
            if (!o.ignoreDuplicates) {
              Object.assign(existing, payload);
              written = existing;
            }
          } else {
            written = { ...payload };
            rowsOf(table).push(written);
          }
          return {
            data: returning ? (written ? [pick(written, returning)] : []) : null,
            error: null,
          };
        };
        const q = {
          select(colStr: string) {
            returning = colStr.split(",").map((c) => c.trim());
            return q;
          },
          then(resolve: (r: Result) => unknown) {
            return Promise.resolve(run()).then(resolve);
          },
        };
        return q;
      },
    };
  }

  return { db: { from } as unknown as SupabaseClient, tables, calls };
}
