import { describe, expect, it } from "vitest";
import {
  candidateIsMatched,
  rankAutoAccept,
  rankSpccAutoAccept,
  runAutoAccept,
  jitterDelay,
  type AutoAcceptCandidate,
  type AutoAcceptDeps,
} from "./auto-accept";
import { normalizeAutoAccept, DEFAULTS, type Settings } from "../../storage/schema";
import type { AcceptLedgerView } from "../../shared/messages";
import { asinFromSpccKey, spccKey } from "./spcc-runner";

const NOW = new Date("2026-10-07T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

const rules = normalizeAutoAccept({
  enabled: true,
  minCommissionPct: 10,
  bands: ["hot", "warm", "cool"],
  excludeEndingWithinHours: 24,
  dailyCap: 5,
  perRunCap: 3,
});

function card(id: string, asin: string, over: Partial<AutoAcceptCandidate> = {}): AutoAcceptCandidate {
  return {
    campaignId: `amzn1.campaign.${id}`,
    brand: `Brand ${id}`,
    commissionRatePct: 15,
    remainingBudgetCents: 500_000,
    endsAt: new Date(NOW + 20 * DAY),
    fillPct: 0.1,
    fullyClaimed: false,
    hasAcceptButton: true,
    asins: [asin],
    ...over,
  };
}

const emptyLedger = { count: 0, items: [], history: [] };

describe("normalizeAutoAccept scope fields", () => {
  it("defaults to matched scope, link submit on, and SPCC thresholds", () => {
    const out = normalizeAutoAccept({});
    expect(out.scope).toBe("matched");
    expect(out.submitLinks).toBe(true);
    expect(out.spccMinBudget).toBe("medium");
    expect(out.spccMinEpcCents).toBe(25);
    expect(out.enabled).toBe(false);
  });

  it("keeps an explicit rules scope and clamps garbage", () => {
    const out = normalizeAutoAccept({
      scope: "rules",
      submitLinks: false,
      spccMinEpcCents: -50,
      spccMinBudget: "nonsense",
    });
    expect(out.scope).toBe("rules");
    expect(out.submitLinks).toBe(false);
    expect(out.spccMinEpcCents).toBe(0);
    expect(out.spccMinBudget).toBe("medium");
  });

  it("the shipped defaults are off and matched-scoped", () => {
    expect(DEFAULTS.settings.autoAccept.enabled).toBe(false);
    expect(DEFAULTS.settings.autoAccept.scope).toBe("matched");
  });
});

describe("rankAutoAccept scope", () => {
  const rows = [card("a", "B000000001"), card("b", "B000000002"), card("c", "B000000003")];

  it("matched scope accepts only cards whose ASIN is in the matched set", () => {
    const matched = new Set(["B000000002"]);
    const picks = rankAutoAccept(rows, rules, emptyLedger, NOW, matched);
    expect(picks.map((p) => p.row.asins?.[0])).toEqual(["B000000002"]);
  });

  it("matched scope with no matched set accepts nothing (never falls back to everything)", () => {
    expect(rankAutoAccept(rows, rules, emptyLedger, NOW, null)).toEqual([]);
    expect(rankAutoAccept(rows, rules, emptyLedger, NOW, new Set())).toEqual([]);
  });

  it("rules scope ignores the matched set", () => {
    const open = normalizeAutoAccept({ ...rules, scope: "rules" });
    const picks = rankAutoAccept(rows, open, emptyLedger, NOW, null);
    expect(picks).toHaveLength(3);
  });

  it("matches ASINs case-insensitively and across multiple card ASINs", () => {
    const row = card("d", "b000000009", { asins: ["b000000009", "B000000001"] });
    expect(candidateIsMatched(row, new Set(["B000000001"]))).toBe(true);
    expect(candidateIsMatched(card("e", "B000000004", { asins: [] }), new Set(["B000000004"]))).toBe(false);
  });

  it("still applies every other rule in matched scope", () => {
    const matched = new Set(["B000000001", "B000000002", "B000000003"]);
    const bad = [
      card("a", "B000000001", { fullyClaimed: true }),
      card("b", "B000000002", { commissionRatePct: 5 }),
      card("c", "B000000003", { endsAt: new Date(NOW + 2 * 60 * 60 * 1000) }),
    ];
    expect(rankAutoAccept(bad, rules, emptyLedger, NOW, matched)).toEqual([]);
  });

  it("skips campaigns already in the ledger and respects the daily room", () => {
    const matched = new Set(["B000000001", "B000000002", "B000000003"]);
    const ledger = {
      count: 4,
      items: [],
      history: [{ campaignId: "amzn1.campaign.a", at: NOW - DAY }],
    };
    const picks = rankAutoAccept(rows, rules, ledger, NOW, matched);
    // dailyCap 5, already 4 today: room for exactly one, and "a" is deduped away.
    expect(picks).toHaveLength(1);
    expect(picks[0]?.row.campaignId).not.toBe("amzn1.campaign.a");
  });
});

describe("jitterDelay", () => {
  it("stays inside the human-paced window", () => {
    expect(jitterDelay(0)).toBe(4_000);
    expect(jitterDelay(1)).toBe(9_000);
    expect(jitterDelay(5)).toBe(9_000);
  });
});

describe("runAutoAccept loop", () => {
  const settings = {
    ...DEFAULTS.settings,
    tools: { ...DEFAULTS.settings.tools, autoAccept: true },
    autoAccept: normalizeAutoAccept({ ...rules, scope: "matched" }),
  } as Settings;

  const ledger: AcceptLedgerView = {
    day: "2026-10-07",
    count: 0,
    items: [],
    history: [],
    cooldownUntil: null,
  };

  function deps(over: Partial<AutoAcceptDeps> = {}): { d: Partial<AutoAcceptDeps>; reports: unknown[] } {
    const reports: unknown[] = [];
    return {
      reports,
      d: {
        readCandidates: () => [card("a", "B000000001"), card("b", "B000000002")],
        getLedger: async () => ledger,
        getMatched: async () => new Set(["B000000001", "B000000002"]),
        accept: async () => ({ ok: true, state: "accepted" }),
        activateSpcc: async () => true,
        readSpccCandidates: () => [],
        acceptSpcc: async () => ({ ok: true, state: "accepted" }),
        report: async (m) => void reports.push(m),
        sleep: async () => undefined,
        random: () => 0,
        now: () => NOW,
        ...over,
      },
    };
  }

  it("accepts the matched picks and reports AUTO_ACCEPT_DONE once", async () => {
    const { d, reports } = deps();
    const out = await runAutoAccept(settings, {}, d);
    expect(out.accepted.map((a) => a.campaignId)).toEqual([
      "amzn1.campaign.a",
      "amzn1.campaign.b",
    ]);
    expect(out.accepted[0]?.asin).toBe("B000000001");
    expect(out.stoppedReason).toBeNull();
    expect(reports).toHaveLength(1);
  });

  it("stops on the first failed accept and keeps what already went through", async () => {
    let calls = 0;
    const { d } = deps({
      accept: async () => (++calls === 1 ? { ok: true, state: "accepted" } : { ok: false, reason: "blocked" }),
    });
    const out = await runAutoAccept(settings, {}, d);
    expect(out.accepted).toHaveLength(1);
    expect(out.stoppedReason).toBe("blocked");
  });

  it("does nothing when the creator has not switched Auto mode on", async () => {
    const off = { ...settings, autoAccept: { ...settings.autoAccept, enabled: false } } as Settings;
    const { d } = deps();
    const out = await runAutoAccept(off, {}, d);
    expect(out).toEqual({ accepted: [], stoppedReason: "disabled" });
  });

  it("honors an active cooldown", async () => {
    const { d } = deps({ getLedger: async () => ({ ...ledger, cooldownUntil: NOW + 1000 }) });
    const out = await runAutoAccept(settings, {}, d);
    expect(out).toEqual({ accepted: [], stoppedReason: "cooldown" });
  });

  it("accepts nothing in matched scope when there are no matched products", async () => {
    const { d } = deps({ getMatched: async () => new Set() });
    const out = await runAutoAccept(settings, {}, d);
    expect(out.accepted).toEqual([]);
    expect(out.stoppedReason).toBeNull();
  });
});

function spccCard(asin: string, over: Partial<AutoAcceptCandidate> = {}): AutoAcceptCandidate {
  return {
    campaignId: null,
    brand: `Brand ${asin}`,
    commissionRatePct: null,
    remainingBudgetCents: null,
    endsAt: null,
    fillPct: null,
    fullyClaimed: null,
    hasAcceptButton: true,
    asins: [asin],
    kind: "spcc",
    epcCents: 60,
    budgetAvailability: "high",
    ...over,
  };
}

describe("spcc keys", () => {
  it("round-trips an ASIN through the ledger key", () => {
    expect(spccKey(" b000000001 ")).toBe("spcc:B000000001");
    expect(asinFromSpccKey("spcc:B000000001")).toBe("B000000001");
    expect(asinFromSpccKey("amzn1.campaign.abc")).toBeNull();
    expect(asinFromSpccKey("spcc:short")).toBeNull();
  });
});

describe("rankSpccAutoAccept", () => {
  const matchedAll = new Set(["B000000001", "B000000002", "B000000003", "B000000004"]);

  it("applies the EPC and budget thresholds and skips unknowns", () => {
    const rows = [
      spccCard("B000000001"),
      spccCard("B000000002", { epcCents: 10 }),
      spccCard("B000000003", { budgetAvailability: "low" }),
      spccCard("B000000004", { epcCents: null }),
    ];
    const picks = rankSpccAutoAccept(rows, rules, emptyLedger, matchedAll, 5);
    expect(picks.map((p) => p.row.asins?.[0])).toEqual(["B000000001"]);
  });

  it("honors the matched scope and the ledger key", () => {
    const rows = [spccCard("B000000001"), spccCard("B000000002")];
    const only2 = new Set(["B000000002"]);
    expect(rankSpccAutoAccept(rows, rules, emptyLedger, only2, 5).map((p) => p.row.asins?.[0])).toEqual([
      "B000000002",
    ]);
    const ledger = { count: 0, items: [], history: [{ campaignId: "spcc:B000000002", at: NOW }] };
    expect(rankSpccAutoAccept(rows, rules, ledger, only2, 5)).toEqual([]);
    expect(rankSpccAutoAccept(rows, rules, emptyLedger, null, 5)).toEqual([]);
  });

  it("ranks higher EPC first and cuts to the room left", () => {
    const rows = [
      spccCard("B000000001", { epcCents: 30 }),
      spccCard("B000000002", { epcCents: 90 }),
      spccCard("B000000003", { epcCents: 60 }),
    ];
    const picks = rankSpccAutoAccept(rows, rules, emptyLedger, matchedAll, 2);
    expect(picks.map((p) => p.row.asins?.[0])).toEqual(["B000000002", "B000000003"]);
    expect(rankSpccAutoAccept(rows, rules, emptyLedger, matchedAll, 0)).toEqual([]);
  });
});

describe("runAutoAccept SPCC phase", () => {
  const settings = {
    ...DEFAULTS.settings,
    tools: { ...DEFAULTS.settings.tools, autoAccept: true },
    autoAccept: normalizeAutoAccept({ ...rules, scope: "matched", includeSpcc: true, perRunCap: 3 }),
  } as Settings;
  const ledger: AcceptLedgerView = { day: "2026-10-07", count: 0, items: [], history: [], cooldownUntil: null };

  function make(over: Partial<AutoAcceptDeps> = {}) {
    const reports: unknown[] = [];
    const spccAccepted: string[] = [];
    const d: Partial<AutoAcceptDeps> = {
      readCandidates: () => [card("a", "B000000001")],
      getLedger: async () => ledger,
      getMatched: async () => new Set(["B000000001", "B000000002", "B000000003"]),
      accept: async () => ({ ok: true, state: "accepted" }),
      activateSpcc: async () => true,
      readSpccCandidates: () => [spccCard("B000000002"), spccCard("B000000003")],
      acceptSpcc: async (asin) => {
        spccAccepted.push(asin);
        return { ok: true, state: "accepted" };
      },
      report: async (m) => void reports.push(m),
      sleep: async () => undefined,
      random: () => 0,
      now: () => NOW,
      ...over,
    };
    return { d, reports, spccAccepted };
  }

  it("accepts CC first, then SPCC within the shared per-run cap", async () => {
    const { d, spccAccepted } = make();
    const out = await runAutoAccept(settings, {}, d);
    // perRunCap 3: one CC pick uses 1, leaving room for both SPCC picks.
    expect(out.accepted.map((a) => a.campaignId)).toEqual([
      "amzn1.campaign.a",
      "spcc:B000000002",
      "spcc:B000000003",
    ]);
    expect(out.accepted.map((a) => a.kind)).toEqual(["cc", "spcc", "spcc"]);
    expect(spccAccepted).toEqual(["B000000002", "B000000003"]);
  });

  it("shares the cap: a perRunCap of 2 leaves room for only one SPCC accept", async () => {
    const tight = {
      ...settings,
      autoAccept: normalizeAutoAccept({ ...settings.autoAccept, perRunCap: 2 }),
    } as Settings;
    const { d, spccAccepted } = make();
    const out = await runAutoAccept(tight, {}, d);
    expect(out.accepted).toHaveLength(2);
    expect(spccAccepted).toEqual(["B000000002"]);
  });

  it("skips SPCC when the creator turned it off, or the tab cannot be confirmed", async () => {
    const off = {
      ...settings,
      autoAccept: normalizeAutoAccept({ ...settings.autoAccept, includeSpcc: false }),
    } as Settings;
    const a = make();
    expect((await runAutoAccept(off, {}, a.d)).accepted.map((x) => x.kind)).toEqual(["cc"]);
    expect(a.spccAccepted).toEqual([]);

    const b = make({ activateSpcc: async () => false });
    expect((await runAutoAccept(settings, {}, b.d)).accepted.map((x) => x.kind)).toEqual(["cc"]);
    expect(b.spccAccepted).toEqual([]);
  });

  it("stops the pass on a blocked SPCC accept and keeps what went through", async () => {
    const { d } = make({ acceptSpcc: async () => ({ ok: false, reason: "blocked" }) });
    const out = await runAutoAccept(settings, {}, d);
    expect(out.accepted.map((x) => x.kind)).toEqual(["cc"]);
    expect(out.stoppedReason).toBe("blocked");
  });
});
