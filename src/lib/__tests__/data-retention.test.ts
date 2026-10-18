/**
 * Summary: Tests for the 12 month retention purges (AI Assistant transcripts and
 * private call recordings). Uses a small in-memory stand-in for the Supabase
 * query builder; Recall.ai media deletion is injected.
 * Dependencies: vitest, ../data-retention.
 */
import { describe, it, expect, vi } from "vitest";
import { cutoffIso, purgeAiSessions, purgeCallRecordings, PURGE_BATCH } from "../data-retention";

type Row = Record<string, unknown>;

/** Just enough of the Supabase builder for the two purge queries. */
function fakeAdmin(tables: Record<string, Row[]>, failUpdateFor: string[] = []) {
  function from(name: string) {
    let rows = tables[name];
    const filters: ((r: Row) => boolean)[] = [];
    let limit = Infinity;
    let patch: Row | null = null;
    let mode: "select" | "delete" | "update" = "select";
    let idList: unknown[] | null = null;
    let eqId: unknown = null;
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.lt = (col: string, v: string) => { filters.push((r) => r[col] != null && String(r[col]) < v); return api; };
    api.or = (expr: string) => {
      const cols = expr.split(",").map((p) => p.split(".")[0]);
      filters.push((r) => cols.some((c) => r[c] != null));
      return api;
    };
    api.order = () => api;
    api.limit = (n: number) => { limit = n; return api; };
    api.delete = () => { mode = "delete"; return api; };
    api.in = (_col: string, ids: unknown[]) => { idList = ids; return api; };
    api.update = (p: Row) => { mode = "update"; patch = p; return api; };
    api.eq = (_col: string, v: unknown) => { eqId = v; return api; };
    api.then = (resolve: (v: unknown) => void) => {
      if (mode === "select") {
        const out = rows.filter((r) => filters.every((f) => f(r))).sort((a, b) => String(a.created_at ?? a.recorded_at).localeCompare(String(b.created_at ?? b.recorded_at))).slice(0, limit);
        return resolve({ data: out, error: null });
      }
      if (mode === "delete") {
        tables[name] = rows.filter((r) => !(idList ?? []).includes(r.id));
        rows = tables[name];
        return resolve({ error: null });
      }
      if (failUpdateFor.includes(String(eqId))) return resolve({ error: { message: "db down" } });
      for (const r of rows) if (r.id === eqId) Object.assign(r, patch);
      return resolve({ error: null });
    };
    return api;
  }
  return { from };
}

const NOW = Date.UTC(2027, 5, 15);
const OLD = "2026-05-01T00:00:00.000Z"; // > 12 months before NOW
const RECENT = "2027-01-01T00:00:00.000Z";

describe("cutoffIso", () => {
  it("is exactly N calendar months back", () => {
    expect(cutoffIso(Date.UTC(2027, 5, 15), 12)).toBe("2026-06-15T00:00:00.000Z");
  });
});

describe("purgeAiSessions", () => {
  it("deletes sessions older than 12 months and keeps newer ones", async () => {
    const tables = { ai_concierge_sessions: [{ id: "old", created_at: OLD }, { id: "new", created_at: RECENT }] };
    const out = await purgeAiSessions(fakeAdmin(tables), { nowMs: NOW });
    expect(out).toMatchObject({ candidates: 1, purged: 1, errors: 0 });
    expect(tables.ai_concierge_sessions.map((r) => r.id)).toEqual(["new"]);
  });

  it("dry run reports candidates but deletes nothing", async () => {
    const tables = { ai_concierge_sessions: [{ id: "old", created_at: OLD }] };
    const out = await purgeAiSessions(fakeAdmin(tables), { nowMs: NOW, dry: true });
    expect(out).toMatchObject({ dry: true, candidates: 1, purged: 0 });
    expect(tables.ai_concierge_sessions).toHaveLength(1);
  });

  it("limits work to one batch per run", async () => {
    const rows = Array.from({ length: PURGE_BATCH + 10 }, (_, i) => ({ id: `s${i}`, created_at: OLD }));
    const tables = { ai_concierge_sessions: rows };
    const out = await purgeAiSessions(fakeAdmin(tables), { nowMs: NOW });
    expect(out.purged).toBe(PURGE_BATCH);
    expect(tables.ai_concierge_sessions).toHaveLength(10);
  });
});

describe("purgeCallRecordings", () => {
  const booking = (over: Row = {}): Row => ({
    id: "b1", recorded_at: OLD, recall_bot_id: "bot1", recording_url: "https://r/1",
    transcript: "hello", ai_notes: { a: 1 }, recording_status: "ready", filed_ticket_ids: ["t1"], ...over,
  });

  it("deletes the Recall media, then clears the recording fields and keeps the booking", async () => {
    const tables = { call_bookings: [booking()] };
    const del = vi.fn(async () => ({ result: "done" as const, status: 200 }));
    const out = await purgeCallRecordings(fakeAdmin(tables), { nowMs: NOW, deleteMedia: del });
    expect(del).toHaveBeenCalledWith("bot1");
    expect(out).toMatchObject({ candidates: 1, purged: 1, errors: 0 });
    expect(tables.call_bookings[0]).toMatchObject({
      recording_url: null, transcript: null, ai_notes: null, recall_bot_id: null, recording_status: "expired", filed_ticket_ids: ["t1"],
    });
  });

  it("leaves the row untouched when Recall fails or the bot is still in progress", async () => {
    const tables = { call_bookings: [booking({ id: "a", recall_bot_id: "botA" }), booking({ id: "b", recall_bot_id: "botB" })] };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const del = vi.fn(async (id: string) => (id === "botA" ? { result: "error" as const, status: 500 } : { result: "pending" as const, status: 400 }));
    const out = await purgeCallRecordings(fakeAdmin(tables), { nowMs: NOW, deleteMedia: del });
    expect(out).toMatchObject({ purged: 0, errors: 1, skipped: 1 });
    expect(tables.call_bookings.every((r) => r.transcript === "hello")).toBe(true);
  });

  it("skips recordings under 12 months old and rows with nothing left to clear", async () => {
    const tables = {
      call_bookings: [
        booking({ id: "recent", recorded_at: RECENT }),
        booking({ id: "cleared", recall_bot_id: null, recording_url: null, transcript: null, ai_notes: null, recording_status: "expired" }),
      ],
    };
    const del = vi.fn();
    const out = await purgeCallRecordings(fakeAdmin(tables), { nowMs: NOW, deleteMedia: del as never });
    expect(out.candidates).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("clears a transcript-only row without calling Recall", async () => {
    const tables = { call_bookings: [booking({ recall_bot_id: null })] };
    const del = vi.fn();
    const out = await purgeCallRecordings(fakeAdmin(tables), { nowMs: NOW, deleteMedia: del as never });
    expect(del).not.toHaveBeenCalled();
    expect(out.purged).toBe(1);
    expect(tables.call_bookings[0].transcript).toBeNull();
  });

  it("dry run changes nothing and never calls Recall", async () => {
    const tables = { call_bookings: [booking()] };
    const del = vi.fn();
    const out = await purgeCallRecordings(fakeAdmin(tables), { nowMs: NOW, dry: true, deleteMedia: del as never });
    expect(out).toMatchObject({ dry: true, candidates: 1, purged: 0 });
    expect(del).not.toHaveBeenCalled();
    expect(tables.call_bookings[0].transcript).toBe("hello");
  });

  it("counts a failed DB update as an error and retries next run", async () => {
    const tables = { call_bookings: [booking()] };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const del = vi.fn(async () => ({ result: "done" as const, status: 200 }));
    const out = await purgeCallRecordings(fakeAdmin(tables, ["b1"]), { nowMs: NOW, deleteMedia: del });
    expect(out).toMatchObject({ purged: 0, errors: 1 });
    expect(tables.call_bookings[0].transcript).toBe("hello");
  });
});
