import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/lemonsqueezy", () => ({ lsApi: vi.fn() }));
vi.mock("@/lib/email-send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: "x" })) }));

import {
  buildCustomerEmail,
  keepPlanToken,
  keepPlanUrl,
  verifyKeepPlanToken,
} from "@/lib/comp-expiry-customer";
import { compConversionSource, isCompSubscriptionId, pendingCompEnd } from "@/lib/comp-conversion";
import type { CompRow } from "@/lib/comps-data";

const DAY = 24 * 60 * 60 * 1000;

function row(over: Partial<CompRow> = {}): CompRow {
  return {
    lsSubscriptionId: "comp:abc",
    userId: "u1",
    email: "jenna@example.com",
    name: "Jenna Smith",
    discountCode: "JENNAFREE12M",
    months: 12,
    monthsSource: "manual",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-11-15T18:00:00.000Z",
    daysRemaining: 7,
    subscriptionStatus: "active",
    planLabel: "Pro Solo",
    renewsAt: null,
    licenseStatus: "active",
    state: "expiring-7",
    cancelledAt: null,
    warn7SentAt: null,
    warn1SentAt: null,
    source: "in_house",
    licenseKey: null,
    activatedAt: null,
    lastSeenAt: null,
    seats: 1,
    issuedByAffiliateId: null,
    issuedByAffiliateName: null,
    issuedByAffiliateEmail: null,
    kind: "creator",
    userWarn7SentAt: null,
    userWarn1SentAt: null,
    ownerCreatorWarnSentAt: null,
    convertedAt: null,
    convertedPlan: null,
    convertedLsSubscriptionId: null,
    firstChargeAt: null,
    ...over,
  };
}

beforeEach(() => {
  process.env.COMP_KEEP_SECRET = "test-secret";
});

describe("keep-my-plan link", () => {
  it("verifies its own token and rejects tampering", () => {
    const t = keepPlanToken("comp:abc");
    expect(verifyKeepPlanToken("comp:abc", t)).toBe(true);
    expect(verifyKeepPlanToken("comp:other", t)).toBe(false);
    expect(verifyKeepPlanToken("comp:abc", t + "x")).toBe(false);
    expect(verifyKeepPlanToken("comp:abc", "")).toBe(false);
  });

  it("builds a /api/comps/keep url", () => {
    expect(keepPlanUrl("comp:abc", "warn7")).toContain("/api/comps/keep?c=comp%3Aabc");
  });
});

describe("customer emails", () => {
  it("creator copy thanks them and names the first charge date", () => {
    const { subject, body } = buildCustomerEmail(row(), "warn7");
    expect(subject).toMatch(/Thank you/);
    expect(body).toMatch(/Keep my plan: /);
    expect(body).toMatch(/first charge would not happen until/);
    expect(body).toMatch(/never charged unless you add a card/);
  });

  it("win-back copy is plainer and says the end date", () => {
    const { subject, body } = buildCustomerEmail(row({ kind: "winback" }), "warn1");
    expect(subject).toMatch(/Last reminder/);
    expect(subject).not.toMatch(/thank/i);
    expect(body).toMatch(/Hi Jenna,/);
  });

  it("never uses an em dash", () => {
    for (const kind of ["creator", "winback"]) {
      for (const n of ["warn7", "warn1"] as const) {
        const { subject, body } = buildCustomerEmail(row({ kind }), n);
        expect(subject + body).not.toContain("—");
      }
    }
  });
});

function svcWith(grants: Record<string, unknown>[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit: async () => ({ data: grants, error: null }),
  };
  return { from: () => builder };
}

describe("comp conversion source", () => {
  const now = Date.parse("2026-11-08T00:00:00Z");

  it("picks a running creator comp as a keeper", async () => {
    const svc = svcWith([
      { ls_subscription_id: "comp:1", expires_at: new Date(now + 5 * DAY).toISOString(), kind: "creator" },
    ]);
    const src = await compConversionSource(svc, "u1", "ls-999", now);
    expect(src?.grant.lsSubscriptionId).toBe("comp:1");
    expect(src?.keeper).toBe(true);
  });

  it("ignores trials and the new subscription itself", async () => {
    const trial = svcWith([
      { ls_subscription_id: "comp:t", expires_at: new Date(now + 5 * DAY).toISOString(), kind: "trial" },
    ]);
    expect(await compConversionSource(trial, "u1", "ls-1", now)).toBeNull();
    const self = svcWith([{ ls_subscription_id: "ls-1", expires_at: null, kind: "creator" }]);
    expect(await compConversionSource(self, "u1", "ls-1", now)).toBeNull();
  });

  it("affiliate passes convert but are not keepers", async () => {
    const svc = svcWith([
      { ls_subscription_id: "comp:a", expires_at: new Date(now - 10 * DAY).toISOString(), kind: "affiliate" },
    ]);
    const src = await compConversionSource(svc, "u1", "ls-2", now);
    expect(src?.keeper).toBe(false);
  });

  it("any running comp gets the delay, even with no kind yet (pre-migration)", async () => {
    const svc = svcWith([
      { ls_subscription_id: "comp:n", expires_at: new Date(now + 28 * DAY).toISOString() },
    ]);
    expect((await compConversionSource(svc, "u1", "ls-4", now))?.keeper).toBe(true);
    const aff = svcWith([
      { ls_subscription_id: "comp:a2", expires_at: new Date(now + 20 * DAY).toISOString(), kind: "affiliate" },
    ]);
    expect((await compConversionSource(aff, "u1", "ls-5", now))?.keeper).toBe(true);
  });

  it("a pre-migration no-card trial (FREE14D code) is not a conversion source", async () => {
    const svc = svcWith([
      { ls_subscription_id: "comp:t2", expires_at: new Date(now + 5 * DAY).toISOString(), discount_code: "JANEFREE14D" },
    ]);
    expect(await compConversionSource(svc, "u1", "ls-6", now)).toBeNull();
  });

  it("an admin-revoked comp gives no delay and no conversion credit", async () => {
    const svc = svcWith([
      {
        ls_subscription_id: "comp:r",
        expires_at: new Date(now + 40 * DAY).toISOString(),
        cancelled_at: new Date(now - 1 * DAY).toISOString(),
        kind: "creator",
      },
    ]);
    expect(await compConversionSource(svc, "u1", "ls-7", now)).toBeNull();
  });

  it("drops comps that ended long ago", async () => {
    const svc = svcWith([
      { ls_subscription_id: "comp:old", expires_at: new Date(now - 200 * DAY).toISOString(), kind: "winback" },
    ]);
    expect(await compConversionSource(svc, "u1", "ls-3", now)).toBeNull();
  });
});

describe("helpers", () => {
  it("isCompSubscriptionId", () => {
    expect(isCompSubscriptionId("comp:x", new Set())).toBe(true);
    expect(isCompSubscriptionId("123", new Set(["123"]))).toBe(true);
    expect(isCompSubscriptionId("456", new Set(["123"]))).toBe(false);
  });

  it("pendingCompEnd returns the latest future end", () => {
    const now = Date.parse("2026-11-08T00:00:00Z");
    const end = pendingCompEnd(
      [
        { lsSubscriptionId: "a", expiresAt: new Date(now + DAY).toISOString(), kind: null, discountCode: null, cancelledAt: null },
        { lsSubscriptionId: "b", expiresAt: new Date(now + 3 * DAY).toISOString(), kind: null, discountCode: null, cancelledAt: null },
        { lsSubscriptionId: "c", expiresAt: new Date(now - DAY).toISOString(), kind: null, discountCode: null, cancelledAt: null },
      ],
      now,
    );
    expect(end).toBe(new Date(now + 3 * DAY).toISOString());
  });
});
