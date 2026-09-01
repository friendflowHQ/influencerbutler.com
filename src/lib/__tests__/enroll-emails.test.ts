/**
 * Summary: Unit tests for enrollEmails' three-way partition (insert new /
 *   reactivate cancelled-or-completed / skip already-active). This is the
 *   load-bearing logic behind the admin Enroll button: without reactivation,
 *   re-adding a cancelled address was a silent no-op (count stuck, no Step 1).
 * Dependencies: vitest and a tiny in-memory fake of the Supabase query builder
 *   modeling the email_sequence_enrollments table. No env or network needed.
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enrollEmails } from "@/lib/email-marketing";

type Row = {
  sequence_id: string;
  email: string;
  enrolled_at: string | null;
  last_step_sent: number;
  last_step_sent_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
};

/**
 * Minimal fake covering exactly the chains enrollEmails uses:
 *   select("...").eq("sequence_id", id).in("email", list)   -> { data }
 *   insert(rows)                                             -> { error: null }
 *   update(patch).eq("sequence_id", id).in("email", list)   -> { error: null }
 * The builder is thenable so `await` resolves it against the in-memory store.
 */
function makeDb(seed: Row[] = []) {
  const store: Row[] = seed.map((r) => ({ ...r }));

  function builder(table: string) {
    const q: {
      op: "select" | "insert" | "update" | null;
      seqId?: string;
      emails?: string[];
      patch?: Partial<Row>;
      inserted?: Array<{ sequence_id: string; email: string }>;
      select: (cols: string) => typeof q;
      insert: (rows: Array<{ sequence_id: string; email: string }>) => typeof q;
      update: (patch: Partial<Row>) => typeof q;
      eq: (col: string, val: string) => typeof q;
      in: (col: string, vals: string[]) => typeof q;
      then: (resolve: (r: { data: Row[] | null; error: null }) => void) => void;
    } = {
      op: null,
      select() {
        this.op = "select";
        return this;
      },
      insert(rows) {
        this.op = "insert";
        this.inserted = rows;
        return this;
      },
      update(patch) {
        this.op = "update";
        this.patch = patch;
        return this;
      },
      eq(col, val) {
        if (col === "sequence_id") this.seqId = val;
        return this;
      },
      in(col, vals) {
        if (col === "email") this.emails = vals;
        return this;
      },
      then(resolve) {
        if (this.op === "insert") {
          for (const row of this.inserted ?? []) {
            store.push({
              sequence_id: row.sequence_id,
              email: row.email,
              enrolled_at: new Date().toISOString(),
              last_step_sent: 0,
              last_step_sent_at: null,
              cancelled_at: null,
              completed_at: null,
            });
          }
          resolve({ data: null, error: null });
          return;
        }
        const emails = new Set(this.emails ?? []);
        const matches = store.filter(
          (r) => r.sequence_id === this.seqId && (table === "" || emails.has(r.email)),
        );
        if (this.op === "update") {
          for (const r of matches) Object.assign(r, this.patch);
          resolve({ data: null, error: null });
          return;
        }
        resolve({ data: matches.map((r) => ({ ...r })), error: null });
      },
    };
    return q;
  }

  const db = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { db, store };
}

const SEQ = "1a5e0002-0000-4000-a000-000000000002";

describe("enrollEmails", () => {
  it("inserts brand-new addresses as fresh active rows", async () => {
    const { db, store } = makeDb();
    const result = await enrollEmails(db, SEQ, ["new@x.com"], { reactivate: true });
    expect(result).toEqual({ inserted: 1, reactivated: 0, skipped: 0 });
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({ email: "new@x.com", last_step_sent: 0, cancelled_at: null });
  });

  it("skips an already-active address (no restart, no double-send)", async () => {
    const { db } = makeDb([
      {
        sequence_id: SEQ,
        email: "active@x.com",
        enrolled_at: "2026-08-01T00:00:00.000Z",
        last_step_sent: 2,
        last_step_sent_at: "2026-08-07T00:00:00.000Z",
        cancelled_at: null,
        completed_at: null,
      },
    ]);
    const result = await enrollEmails(db, SEQ, ["active@x.com"], { reactivate: true });
    expect(result).toEqual({ inserted: 0, reactivated: 0, skipped: 1 });
  });

  it("reactivates a cancelled address back to a fresh Step 1", async () => {
    const { db, store } = makeDb([
      {
        sequence_id: SEQ,
        email: "cancelled@x.com",
        enrolled_at: "2026-08-01T00:00:00.000Z",
        last_step_sent: 1,
        last_step_sent_at: "2026-08-01T00:00:00.000Z",
        cancelled_at: "2026-08-05T00:00:00.000Z",
        completed_at: null,
      },
    ]);
    const result = await enrollEmails(db, SEQ, ["cancelled@x.com"], { reactivate: true });
    expect(result).toEqual({ inserted: 0, reactivated: 1, skipped: 0 });
    expect(store[0]).toMatchObject({
      last_step_sent: 0,
      last_step_sent_at: null,
      cancelled_at: null,
      completed_at: null,
    });
  });

  it("reactivates a completed address too", async () => {
    const { db } = makeDb([
      {
        sequence_id: SEQ,
        email: "done@x.com",
        enrolled_at: "2026-08-01T00:00:00.000Z",
        last_step_sent: 4,
        last_step_sent_at: "2026-08-14T00:00:00.000Z",
        cancelled_at: null,
        completed_at: "2026-08-14T00:00:00.000Z",
      },
    ]);
    const result = await enrollEmails(db, SEQ, ["done@x.com"], { reactivate: true });
    expect(result).toEqual({ inserted: 0, reactivated: 1, skipped: 0 });
  });

  it("does NOT reactivate when the flag is off (tag/auto-enroll path)", async () => {
    const { db, store } = makeDb([
      {
        sequence_id: SEQ,
        email: "cancelled@x.com",
        enrolled_at: "2026-08-01T00:00:00.000Z",
        last_step_sent: 1,
        last_step_sent_at: "2026-08-01T00:00:00.000Z",
        cancelled_at: "2026-08-05T00:00:00.000Z",
        completed_at: null,
      },
    ]);
    const result = await enrollEmails(db, SEQ, ["cancelled@x.com", "new@x.com"]);
    expect(result).toEqual({ inserted: 1, reactivated: 0, skipped: 1 });
    // The cancelled row is untouched.
    expect(store.find((r) => r.email === "cancelled@x.com")?.cancelled_at).toBe(
      "2026-08-05T00:00:00.000Z",
    );
  });

  it("handles a mixed batch and dedupes case-insensitively", async () => {
    const { db } = makeDb([
      {
        sequence_id: SEQ,
        email: "active@x.com",
        enrolled_at: "2026-08-01T00:00:00.000Z",
        last_step_sent: 1,
        last_step_sent_at: null,
        cancelled_at: null,
        completed_at: null,
      },
      {
        sequence_id: SEQ,
        email: "cancelled@x.com",
        enrolled_at: "2026-08-01T00:00:00.000Z",
        last_step_sent: 1,
        last_step_sent_at: null,
        cancelled_at: "2026-08-05T00:00:00.000Z",
        completed_at: null,
      },
    ]);
    const result = await enrollEmails(
      db,
      SEQ,
      ["NEW@x.com", "new@x.com", "Active@x.com", "cancelled@x.com"],
      { reactivate: true },
    );
    expect(result).toEqual({ inserted: 1, reactivated: 1, skipped: 1 });
  });
});
