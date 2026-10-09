/**
 * Summary: Unit tests for the recurring Group Mirror campaign's pure pieces:
 *   the pricing-note cutoff, run-time stepping, body builder, link tags, the
 *   audience's campaign-exclusion validator, and an end-to-end run against a
 *   tiny in-memory database (disabled/not-due, claim, caps, skip, no repeats).
 * Dependencies: vitest, @/lib/recurring-campaign, @/lib/email-audience,
 *   @/lib/campaign-email. Sending is mocked; no env or network needed.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/email-send", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

import {
  PRICING_NOTE_ENDS_AT,
  RECURRING_FIRST_RUN_AT,
  RECURRING_MAX_PER_RUN,
  RECURRING_SERIES_SEED,
  advanceRunTime,
  buildRecurringBody,
  includePricingNote,
  recurringSrcTag,
  runRecurringIfDue,
  setRecurringEnabled,
} from "@/lib/recurring-campaign";
import { parseAudience } from "@/lib/email-audience";
import { extractSrcTags, hasCampaignMarkup } from "@/lib/campaign-email";

const DAY = 86_400_000;

describe("includePricingNote", () => {
  it("is true before Dec 1 Mountain and false from then on", () => {
    const cutoff = Date.parse(PRICING_NOTE_ENDS_AT);
    expect(includePricingNote(new Date(cutoff - 1))).toBe(true);
    expect(includePricingNote(new Date(cutoff))).toBe(false);
    expect(includePricingNote(new Date("2026-10-26T23:00:00Z"))).toBe(true);
    expect(includePricingNote(new Date("2026-12-10T23:00:00Z"))).toBe(false);
  });
});

describe("advanceRunTime", () => {
  it("steps by the interval from the due slot, anchored to the same hour", () => {
    const due = Date.parse(RECURRING_FIRST_RUN_AT);
    expect(advanceRunTime(due, due + 120_000, 14)).toBe(due + 14 * DAY);
  });

  it("skips whole intervals when the cron was down for a while", () => {
    const due = Date.parse(RECURRING_FIRST_RUN_AT);
    const now = due + 30 * DAY;
    const next = advanceRunTime(due, now, 14);
    expect(next).toBe(due + 42 * DAY);
    expect(next).toBeGreaterThan(now);
    expect((next - due) % (14 * DAY)).toBe(0);
  });
});

describe("recurringSrcTag and buildRecurringBody", () => {
  it("makes a unique, valid tag per day", () => {
    expect(recurringSrcTag(new Date("2026-10-26T23:00:00Z"))).toBe("group-mirror-auto-20261026");
    expect(recurringSrcTag(new Date("2026-11-09T23:00:00Z"))).toBe("group-mirror-auto-20261109");
  });

  it("includes the pricing P.S. and the Facebook P.P.S. before the cutoff", () => {
    const body = buildRecurringBody("group-mirror-auto-20261026", true);
    expect(body).toContain("P.S. **Pro pricing goes up at the end of November**");
    expect(body).toContain("P.P.S. Come hang out with us in the Influencer Butler Facebook group");
    expect(body).toContain("facebook.com/groups/influencerbutler");
    expect(extractSrcTags(body)).toEqual(["group-mirror-auto-20261026"]);
    expect(hasCampaignMarkup(body)).toBe(true);
  });

  it("drops the pricing note after the cutoff and keeps the Facebook line as the P.S.", () => {
    const body = buildRecurringBody("group-mirror-auto-20261209", false);
    expect(body).not.toMatch(/pricing goes up/i);
    expect(body).not.toContain("P.P.S.");
    expect(body).toContain("P.S. Come hang out with us in the Influencer Butler Facebook group");
  });

  it("never contains an em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    expect(buildRecurringBody("x", true)).not.toContain(emDash);
    expect(buildRecurringBody("x", false)).not.toContain(emDash);
  });
});

describe("parseAudience excludeCampaignIds", () => {
  const A = "7c71e6d3-102b-4b84-8570-72eeea0e4939";
  const B = "377f929d-c5fe-47f2-ac88-407aa4d0c486";

  it("keeps a valid, deduplicated, lowercased list on any audience", () => {
    expect(
      parseAudience({
        kind: "opened_nonpaid",
        minOpens: 1,
        excludeCampaignIds: [A.toUpperCase(), B, A],
      }),
    ).toEqual({ kind: "opened_nonpaid", minOpens: 1, excludeCampaignIds: [A, B] });
  });

  it("omits an empty or absent list", () => {
    expect(parseAudience({ kind: "all_contacts", excludeCampaignIds: [] })).toEqual({
      kind: "all_contacts",
    });
    expect(parseAudience({ kind: "all_contacts" })).toEqual({ kind: "all_contacts" });
  });

  it("rejects anything that is not a list of campaign uuids", () => {
    expect(parseAudience({ kind: "all_contacts", excludeCampaignIds: "nope" })).toBeNull();
    expect(parseAudience({ kind: "all_contacts", excludeCampaignIds: ["not-a-uuid"] })).toBeNull();
    expect(parseAudience({ kind: "all_contacts", excludeCampaignIds: [A, 5] })).toBeNull();
  });

  it("combines with a split", () => {
    expect(
      parseAudience({ kind: "all_contacts", split: { index: 1, of: 2 }, excludeCampaignIds: [A] }),
    ).toEqual({ kind: "all_contacts", split: { index: 1, of: 2 }, excludeCampaignIds: [A] });
  });
});

// ---------------------------------------------------------------------------
// A tiny in-memory stand-in for the parts of Supabase the run touches.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function fakeDb(opts: { emails: string[]; enabled: boolean; nextRunAt: string }) {
  const tables: Record<string, Row[]> = {
    app_config: [
      {
        key: "recurring_group_mirror",
        value: {
          enabled: opts.enabled,
          nextRunAt: opts.nextRunAt,
          lastRunAt: null,
          lastCampaignId: null,
          seriesCampaignIds: [],
          history: [],
        },
      },
    ],
    email_campaigns: [],
    email_campaign_recipients: [],
    email_sends: opts.emails.map((email) => ({
      recipient: email,
      opened_at: "2026-10-01T00:00:00Z",
      created_at: "2026-10-01T00:00:00Z",
    })),
    profiles: [],
    subscriptions: [],
    email_suppressions: [],
    email_subscribers: [],
  };
  let insertId = 0;

  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "update" | "insert" | "upsert" = "select";
    let payload: Row | null = null;
    let range: [number, number] | null = null;
    let single = false;
    const api: Record<string, unknown> = {};
    const run = () => {
      const rows = tables[table] ?? [];
      if (mode === "insert") {
        const row = { id: `new-${++insertId}`, ...(payload as Row) };
        rows.push(row);
        tables[table] = rows;
        return { data: single ? row : [row], error: null };
      }
      if (mode === "upsert") {
        const idx = rows.findIndex((r) => r.key === (payload as Row).key);
        if (idx >= 0) rows[idx] = { ...rows[idx], ...(payload as Row) };
        else rows.push(payload as Row);
        return { data: null, error: null };
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: matched, error: null };
      }
      if (range) matched = matched.slice(range[0], range[1] + 1);
      return { data: single ? matched[0] ?? null : matched, error: null };
    };
    const chain = (fn: () => void) => () => {
      fn();
      return api;
    };
    api.select = chain(() => {});
    api.insert = (row: Row) => {
      mode = "insert";
      payload = row;
      return api;
    };
    api.update = (row: Row) => {
      mode = "update";
      payload = row;
      return api;
    };
    api.upsert = (row: Row) => {
      mode = "upsert";
      payload = row;
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      filters.push((r) => {
        if (col.startsWith("value->>")) {
          return String((r.value as Row)[col.slice("value->>".length)]) === String(val);
        }
        return r[col] === val;
      });
      return api;
    };
    api.in = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return api;
    };
    api.not = (col: string) => {
      filters.push((r) => r[col] !== null && r[col] !== undefined);
      return api;
    };
    api.order = chain(() => {});
    api.range = (from: number, to: number) => {
      range = [from, to];
      return api;
    };
    api.gte = chain(() => {});
    api.maybeSingle = () => {
      single = true;
      return Promise.resolve(run());
    };
    api.single = () => {
      single = true;
      return Promise.resolve(run());
    };
    api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve);
    return api;
  }

  return {
    tables,
    db: { from: (table: string) => builder(table) } as unknown as import("@supabase/supabase-js").SupabaseClient,
  };
}

const NOW = new Date("2026-10-26T23:02:00Z");

describe("runRecurringIfDue", () => {
  it("does nothing while paused", async () => {
    const f = fakeDb({ emails: ["a@x.com"], enabled: false, nextRunAt: RECURRING_FIRST_RUN_AT });
    expect(await runRecurringIfDue(f.db, NOW)).toEqual({ ran: false, reason: "disabled" });
    expect(f.tables.email_campaigns).toHaveLength(0);
  });

  it("does nothing before the next run time", async () => {
    const f = fakeDb({ emails: ["a@x.com"], enabled: true, nextRunAt: "2026-11-09T23:00:00.000Z" });
    expect(await runRecurringIfDue(f.db, NOW)).toEqual({ ran: false, reason: "not_due" });
  });

  it("skips a run with too few new openers and still advances the schedule", async () => {
    const f = fakeDb({
      emails: Array.from({ length: 5 }, (_, i) => `p${i}@x.com`),
      enabled: true,
      nextRunAt: RECURRING_FIRST_RUN_AT,
    });
    const res = await runRecurringIfDue(f.db, NOW);
    expect(res).toMatchObject({ ran: true, outcome: "skipped_too_few", recipients: 5 });
    expect(f.tables.email_campaigns).toHaveLength(0);
    const state = f.tables.app_config[0].value as Row;
    expect(state.nextRunAt).toBe("2026-11-09T23:00:00.000Z");
  });

  it("creates one capped, sending campaign with a frozen pasted audience", async () => {
    const emails = Array.from({ length: 1700 }, (_, i) => `person${i}@x.com`);
    const f = fakeDb({ emails, enabled: true, nextRunAt: RECURRING_FIRST_RUN_AT });
    const res = await runRecurringIfDue(f.db, NOW);
    expect(res).toMatchObject({ ran: true, outcome: "sent", recipients: RECURRING_MAX_PER_RUN });
    expect(f.tables.email_campaigns).toHaveLength(1);
    const campaign = f.tables.email_campaigns[0];
    expect(campaign.status).toBe("sending");
    expect(campaign.created_by).toBe("auto:recurring");
    const audience = campaign.audience as { kind: string; emails: string[] };
    expect(audience.kind).toBe("pasted");
    expect(audience.emails).toHaveLength(RECURRING_MAX_PER_RUN);
    expect(String(campaign.body)).toContain("group-mirror-auto-20261026");
    expect(String(campaign.body)).toContain("pricing goes up");
    const state = f.tables.app_config[0].value as { seriesCampaignIds: string[]; nextRunAt: string };
    expect(state.seriesCampaignIds).toContain(campaign.id);
    expect(state.nextRunAt).toBe("2026-11-09T23:00:00.000Z");
  });

  it("drops the pricing note on a run after Dec 1", async () => {
    const f = fakeDb({
      emails: Array.from({ length: 40 }, (_, i) => `p${i}@x.com`),
      enabled: true,
      nextRunAt: "2026-12-07T23:00:00.000Z",
    });
    const res = await runRecurringIfDue(f.db, new Date("2026-12-07T23:01:00Z"));
    expect(res).toMatchObject({ ran: true, outcome: "sent" });
    expect(String(f.tables.email_campaigns[0].body)).not.toMatch(/pricing goes up/i);
  });

  it("never sends the same slot twice (second call finds it already claimed)", async () => {
    const f = fakeDb({
      emails: Array.from({ length: 40 }, (_, i) => `p${i}@x.com`),
      enabled: true,
      nextRunAt: RECURRING_FIRST_RUN_AT,
    });
    await runRecurringIfDue(f.db, NOW);
    const second = await runRecurringIfDue(f.db, new Date(NOW.getTime() + 60_000));
    expect(second).toEqual({ ran: false, reason: "not_due" });
    expect(f.tables.email_campaigns).toHaveLength(1);
  });
});

describe("setRecurringEnabled", () => {
  it("turning on after the next-run time has passed moves to the next slot instead of firing now", async () => {
    const f = fakeDb({ emails: [], enabled: false, nextRunAt: RECURRING_FIRST_RUN_AT });
    const state = await setRecurringEnabled(f.db, true, "test", new Date("2026-11-02T10:00:00Z"));
    expect(state?.enabled).toBe(true);
    expect(state?.nextRunAt).toBe("2026-11-09T23:00:00.000Z");
  });

  it("keeps the first run time when turned on before it", async () => {
    const f = fakeDb({ emails: [], enabled: false, nextRunAt: RECURRING_FIRST_RUN_AT });
    const state = await setRecurringEnabled(f.db, true, "test", new Date("2026-10-09T10:00:00Z"));
    expect(state?.nextRunAt).toBe(RECURRING_FIRST_RUN_AT);
  });

  it("seeds the series with the campaigns already sent", () => {
    expect(RECURRING_SERIES_SEED).toContain("7c71e6d3-102b-4b84-8570-72eeea0e4939");
    expect(RECURRING_SERIES_SEED).toHaveLength(4);
  });
});
