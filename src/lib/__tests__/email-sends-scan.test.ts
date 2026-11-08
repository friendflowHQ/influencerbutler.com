import { describe, expect, it } from "vitest";

import { scanNewestFirst } from "@/lib/email-sends-scan";

type Row = { id: string; created_at: string };

// In-memory stand-in for the two PostgREST queries the routes issue.
function fakeDb(rows: Row[]) {
  const desc = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const calls = { page: 0, ties: 0 };
  return {
    calls,
    page: (before: string | null, limit: number) => {
      calls.page += 1;
      const data = desc.filter((r) => before === null || r.created_at < before).slice(0, limit);
      return Promise.resolve({ data, error: null });
    },
    ties: (at: string, from: number, to: number) => {
      calls.ties += 1;
      const data = rows
        .filter((r) => r.created_at === at)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(from, to + 1);
      return Promise.resolve({ data, error: null });
    },
  };
}

function ts(n: number) {
  return `2026-11-${String(1 + Math.floor(n / 100)).padStart(2, "0")}T00:00:${String(n % 60).padStart(2, "0")}.${String(n).padStart(6, "0")}+00:00`;
}

async function collect(rows: Row[], batch: number, maxRows?: number) {
  const db = fakeDb(rows);
  const seen: string[] = [];
  const out = await scanNewestFirst<Row>(db.page, db.ties, (r) => seen.push(...r.map((x) => x.id)), {
    batch,
    maxRows,
  });
  return { seen, out, calls: db.calls };
}

describe("scanNewestFirst", () => {
  it("returns every row once when timestamps are unique", async () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ id: `r${i}`, created_at: ts(i) }));
    const { seen, out } = await collect(rows, 5);
    expect(out.error).toBeNull();
    expect(seen.sort()).toEqual(rows.map((r) => r.id).sort());
    expect(new Set(seen).size).toBe(rows.length);
  });

  it("does not drop or double count a same-timestamp group split across batches", async () => {
    const rows: Row[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `new${i}`, created_at: ts(50 + i) })),
      ...Array.from({ length: 7 }, (_, i) => ({ id: `tie${i}`, created_at: ts(40) })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `old${i}`, created_at: ts(i) })),
    ];
    const { seen } = await collect(rows, 5);
    expect(seen.sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("handles a tie group larger than a whole batch", async () => {
    const rows: Row[] = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `tie${String(i).padStart(2, "0")}`, created_at: ts(40) })),
      { id: "old", created_at: ts(1) },
    ];
    const { seen } = await collect(rows, 5);
    expect(seen.sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("stops and flags truncated past maxRows", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, created_at: ts(i) }));
    const { out } = await collect(rows, 5, 10);
    expect(out.truncated).toBe(true);
    expect(out.fetched).toBeGreaterThanOrEqual(10);
    expect(out.fetched).toBeLessThan(30);
  });

  it("surfaces a query error", async () => {
    const out = await scanNewestFirst<Row>(
      () => Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }),
      () => Promise.resolve({ data: [], error: null }),
      () => {},
    );
    expect(out.error?.code).toBe("57014");
  });
});
