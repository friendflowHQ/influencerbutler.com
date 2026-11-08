/**
 * Upgrade funnel (Beginner to Power User): copy rules, registry registration,
 * step selection, and the claim-first idempotency in sendUpgradeEmail with a
 * fake Supabase client (sent, already sent, migration pending, failed send
 * releases the claim).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMarketingEmail = vi.fn(async (_e: Record<string, unknown>) => true);
vi.mock("@/lib/marketing-email", () => ({ sendMarketingEmail: (e: Record<string, unknown>) => sendMarketingEmail(e) }));
vi.mock("@/lib/email-marketing", () => ({ tagRecipientsAsContacts: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("tests inject db");
  },
}));
vi.mock("@/lib/funnel-copy", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, getFunnelOverrides: async () => new Map() };
});

import {
  DEFAULT_UPGRADE_TOOLS_LINE,
  UPGRADE_COPY,
  selectUpgradeTier,
  sendUpgradeEmail,
  upgradePriceLockLine,
  upgradeVarsFrom,
  type UpgradeTier,
} from "@/lib/upgrade-emails";
import { lookupTrackCopy } from "@/lib/funnel-track-registry";
import { LEVEL_PRICE_CENTS, PRICE_CHANGE } from "@/lib/pricing-constants";

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const DAY = 86_400_000;
const BEFORE = Date.parse("2026-11-08T12:00:00Z");
const AFTER = Date.parse(PRICE_CHANGE.effectiveAt) + DAY;

function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

describe("upgrade copy", () => {
  const tiers: UpgradeTier[] = ["u1", "u2"];

  it("renders every tier with no dashes, placeholders or banned names", () => {
    for (const t of tiers) {
      for (const now of [BEFORE, AFTER]) {
        const body = UPGRADE_COPY[t].build(upgradeVarsFrom({ firstName: "Alex" }, now));
        const text = `${UPGRADE_COPY[t].subject}\n${body}`;
        expect(text).not.toContain(EM_DASH);
        expect(text).not.toContain(EN_DASH);
        expect(text).not.toMatch(/\{\{|\$\{|undefined|null/);
        expect(text).not.toMatch(/harvest/i);
        expect(body).toContain("Hi Alex,");
      }
    }
  });

  it("takes the Power User price from pricing-constants, before and after the change", () => {
    const today = dollars(LEVEL_PRICE_CENTS.power.solo!.monthly);
    const next = dollars(PRICE_CHANGE.prices.power.solo!.monthly);
    expect(UPGRADE_COPY.u1.build(upgradeVarsFrom({}, BEFORE))).toContain(`${today}/month`);
    expect(UPGRADE_COPY.u1.build(upgradeVarsFrom({}, AFTER))).toContain(`${next}/month`);
  });

  it("ignores the Beginner-base {{price}} the cron passes and uses the Power price", () => {
    const beginner = dollars(LEVEL_PRICE_CENTS.beginner.solo!.monthly);
    const body = UPGRADE_COPY.u1.build(upgradeVarsFrom({ price: `${beginner}/month` }, BEFORE));
    expect(body).not.toContain(`starts at ${beginner}`);
  });

  it("drops the price-lock line once the change date passes", () => {
    expect(upgradePriceLockLine(BEFORE)).toMatch(/keep today's Power User price/);
    expect(upgradePriceLockLine(AFTER)).toBe("");
    expect(UPGRADE_COPY.u2.build(upgradeVarsFrom({}, AFTER))).not.toMatch(/prices go up/i);
  });

  it("u2 sells the Priority 1:1 (Power-only), never claims setup calls are Power-only", () => {
    const body = UPGRADE_COPY.u2.build(upgradeVarsFrom({}, BEFORE));
    expect(body).toMatch(/Priority 1:1/);
    expect(body).toMatch(/45 minutes/);
    expect(body).not.toMatch(/setup call/i);
    expect(body).toContain("/dashboard/book");
  });

  it("falls back to the default tools line and default URLs", () => {
    const v = upgradeVarsFrom({ bookCallUrl: "", toolsLine: "" }, BEFORE);
    expect(v.toolsLine).toBe(DEFAULT_UPGRADE_TOOLS_LINE);
    expect(v.bookCallUrl).toMatch(/\/dashboard\/book$/);
    expect(v.upgradeUrl).toMatch(/\/dashboard\/subscription$/);
  });

  it("registers u1 and u2 as bare keys in the track registry", () => {
    for (const t of tiers) {
      const e = lookupTrackCopy("upgrade", t);
      expect(e).not.toBeNull();
      expect(String(e!.build({ firstName: "Sam", toolsLine: "Walmart Butler" }))).toContain("Hi Sam,");
    }
  });
});

describe("selectUpgradeTier", () => {
  const start = Date.parse("2026-10-13T00:00:00Z");

  it("is null before day 21", () => {
    expect(selectUpgradeTier({ startedAtMs: start, sent: new Set(), now: start + 20 * DAY })).toBeNull();
  });

  it("picks u1 from day 21 and u2 from day 35", () => {
    expect(selectUpgradeTier({ startedAtMs: start, sent: new Set(), now: start + 21 * DAY })).toBe("u1");
    expect(selectUpgradeTier({ startedAtMs: start, sent: new Set(["u1"]), now: start + 35 * DAY })).toBe("u2");
  });

  it("sends only the latest due step on a backlog and never goes backwards", () => {
    expect(selectUpgradeTier({ startedAtMs: start, sent: new Set(), now: start + 40 * DAY })).toBe("u2");
    expect(selectUpgradeTier({ startedAtMs: start, sent: new Set(["u2"]), now: start + 40 * DAY })).toBeNull();
    expect(selectUpgradeTier({ startedAtMs: start, sent: new Set(["u1"]), now: start + 30 * DAY })).toBeNull();
  });

  it("honors threshold overrides and rejects a missing start", () => {
    expect(
      selectUpgradeTier({ startedAtMs: start, sent: new Set(), now: start + 10 * DAY, thresholdsMs: { u1: 7 * DAY } }),
    ).toBe("u1");
    expect(selectUpgradeTier({ startedAtMs: null, sent: new Set(), now: start })).toBeNull();
  });
});

// Minimal fake of the supabase-js chain used by the claim helpers.
type Row = Record<string, unknown>;
function fakeDb(opts: { insertError?: { code: string } | null; rows?: Row[] } = {}) {
  const rows: Row[] = opts.rows ?? [];
  const calls = { inserts: 0, deletes: 0 };
  const db = {
    from(_table: string) {
      return {
        insert: async (row: Row) => {
          calls.inserts += 1;
          if (opts.insertError) return { error: opts.insertError };
          if (rows.some((r) => r.email === row.email && r.funnel === row.funnel && r.tier === row.tier)) {
            return { error: { code: "23505" } };
          }
          rows.push(row);
          return { error: null };
        },
        delete: () => {
          const filters: Row = {};
          const chain = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              if (Object.keys(filters).length === 3) {
                calls.deletes += 1;
                for (let i = rows.length - 1; i >= 0; i--) {
                  if (Object.entries(filters).every(([k, v]) => rows[i][k] === v)) rows.splice(i, 1);
                }
                return Promise.resolve({ error: null });
              }
              return chain;
            },
          };
          return chain;
        },
      };
    },
  };
  return { db: db as never, rows, calls };
}

describe("sendUpgradeEmail idempotency", () => {
  beforeEach(() => {
    sendMarketingEmail.mockReset();
    sendMarketingEmail.mockResolvedValue(true);
  });

  it("claims, sends once, then reports already_sent", async () => {
    const f = fakeDb();
    const first = await sendUpgradeEmail({ tier: "u1", to: "Alex@Example.com ", name: "Alex Doe", db: f.db, now: BEFORE });
    expect(first).toEqual({ ok: true, status: "sent", contentKey: "u1" });
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]).toMatchObject({ email: "alex@example.com", funnel: "upgrade", tier: "u1", step_key: "u1" });
    expect(sendMarketingEmail).toHaveBeenCalledTimes(1);
    const sent = sendMarketingEmail.mock.calls[0][0];
    expect(sent).toMatchObject({ category: "upgrade_u1", funnel: "upgrade", stepKey: "u1", trackOpens: true });
    expect(String(sent.text)).toContain("Hi Alex,");

    const again = await sendUpgradeEmail({ tier: "u1", to: "alex@example.com", name: "Alex", db: f.db, now: BEFORE });
    expect(again.status).toBe("already_sent");
    expect(again.ok).toBe(true);
    expect(sendMarketingEmail).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the progress table is missing", async () => {
    for (const code of ["42P01", "PGRST205"]) {
      const f = fakeDb({ insertError: { code } });
      const r = await sendUpgradeEmail({ tier: "u2", to: "a@b.com", db: f.db, now: BEFORE });
      expect(r.status).toBe("migration_pending");
      expect(r.ok).toBe(false);
    }
    expect(sendMarketingEmail).not.toHaveBeenCalled();
  });

  it("releases the claim when the send fails so the next run retries", async () => {
    sendMarketingEmail.mockResolvedValueOnce(false);
    const f = fakeDb();
    const r = await sendUpgradeEmail({ tier: "u1", to: "a@b.com", db: f.db, now: BEFORE });
    expect(r.status).toBe("failed");
    expect(f.rows).toHaveLength(0);
    expect(f.calls.deletes).toBe(1);

    const retry = await sendUpgradeEmail({ tier: "u1", to: "a@b.com", db: f.db, now: BEFORE });
    expect(retry.status).toBe("sent");
  });

  it("keeps a valid tailored content key and ignores one for another tier", async () => {
    const f = fakeDb();
    const r = await sendUpgradeEmail({ tier: "u1", to: "a@b.com", contentKey: "u1.beginner", db: f.db, now: BEFORE });
    expect(r.contentKey).toBe("u1.beginner");
    const f2 = fakeDb();
    const r2 = await sendUpgradeEmail({ tier: "u1", to: "a@b.com", contentKey: "u2.beginner", db: f2.db, now: BEFORE });
    expect(r2.contentKey).toBe("u1");
  });

  it("does not send on an unknown claim error", async () => {
    const f = fakeDb({ insertError: { code: "XX000" } });
    const r = await sendUpgradeEmail({ tier: "u1", to: "a@b.com", db: f.db, now: BEFORE });
    expect(r.status).toBe("failed");
    expect(sendMarketingEmail).not.toHaveBeenCalled();
  });
});
