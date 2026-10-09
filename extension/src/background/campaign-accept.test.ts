import { describe, expect, it } from "vitest";
import {
  acceptAsins,
  buildAcceptFinding,
  cooldownActive,
  dayKey,
  emptyLedger,
  readAcceptLedger,
  recordAccept,
  rolloverIfNeeded,
  type AcceptLedger,
} from "./campaign-accept";
import { ACCEPT_BLOCK_COOLDOWN_MS } from "../shared/constants";

// The tab driver needs chrome.tabs and a live page; the pure ledger + cooldown
// helpers it gates on are covered here.

const ID_A = "amzn1.campaign.AAAAAAAAAAAAA";
const ID_B = "amzn1.campaign.BBBBBBBBBBBBB";

// Local noon on two consecutive days, so dayKey (local calendar) is stable
// regardless of the machine's timezone.
const DAY1 = new Date(2026, 8, 8, 12, 0, 0).getTime();
const DAY2 = new Date(2026, 8, 9, 12, 0, 0).getTime();

describe("acceptAsins", () => {
  it("keeps valid ASINs, upper-cased and de-duplicated", () => {
    expect(acceptAsins(ID_A, ["b0abcdefgh", "B0ABCDEFGH", "B0ZZZZZZZZ", "bad"])).toEqual([
      "B0ABCDEFGH",
      "B0ZZZZZZZZ",
    ]);
  });

  it("accepts a single ASIN string", () => {
    expect(acceptAsins(ID_A, "B0ABCDEFGH")).toEqual(["B0ABCDEFGH"]);
  });

  it("returns nothing for a CC campaign with no ASINs", () => {
    expect(acceptAsins(ID_A)).toEqual([]);
    expect(acceptAsins(ID_A, null)).toEqual([]);
  });

  it("recovers the ASIN from an SPCC key", () => {
    expect(acceptAsins("spcc:B0ABCDEFGH")).toEqual(["B0ABCDEFGH"]);
  });
});

describe("buildAcceptFinding", () => {
  it("carries the ASINs for the desktop mirror when known", () => {
    expect(buildAcceptFinding(ID_A, "manual", ["B0ABCDEFGH"], DAY1)).toEqual({
      type: "campaign_accept",
      campaignId: ID_A,
      source: "manual",
      detectedAt: new Date(DAY1).toISOString(),
      asins: ["B0ABCDEFGH"],
    });
  });

  it("omits asins entirely when none are known", () => {
    expect(buildAcceptFinding(ID_A, "auto", [], DAY1)).not.toHaveProperty("asins");
  });
});

describe("dayKey", () => {
  it("formats the local calendar day as YYYY-MM-DD", () => {
    expect(dayKey(DAY1)).toBe("2026-09-08");
    expect(dayKey(new Date(2026, 0, 3, 0, 5).getTime())).toBe("2026-01-03");
  });
});

describe("rolloverIfNeeded", () => {
  it("keeps today's ledger", () => {
    const ledger: AcceptLedger = {
      day: dayKey(DAY1),
      count: 2,
      items: [{ campaignId: ID_A, at: DAY1, source: "manual" }],
      history: [],
    };
    expect(rolloverIfNeeded(ledger, DAY1)).toBe(ledger);
  });

  it("starts fresh on a new day", () => {
    const ledger: AcceptLedger = {
      day: dayKey(DAY1),
      count: 2,
      items: [{ campaignId: ID_A, at: DAY1, source: "manual" }],
      history: [],
    };
    expect(rolloverIfNeeded(ledger, DAY2)).toEqual(emptyLedger(dayKey(DAY2)));
  });
});

describe("recordAccept", () => {
  it("appends and counts within the same day", () => {
    let ledger = emptyLedger(dayKey(DAY1));
    ledger = recordAccept(ledger, ID_A, "manual", DAY1);
    ledger = recordAccept(ledger, ID_B, "auto", DAY1 + 1000);
    expect(ledger.count).toBe(2);
    expect(ledger.items.map((i) => i.campaignId)).toEqual([ID_A, ID_B]);
    expect(ledger.items[1]?.source).toBe("auto");
  });

  it("rolls the day over before recording", () => {
    let ledger = emptyLedger(dayKey(DAY1));
    ledger = recordAccept(ledger, ID_A, "manual", DAY1);
    ledger = recordAccept(ledger, ID_B, "manual", DAY2);
    expect(ledger.day).toBe(dayKey(DAY2));
    expect(ledger.count).toBe(1);
    expect(ledger.items.map((i) => i.campaignId)).toEqual([ID_B]);
  });

  it("does not mutate the input ledger", () => {
    const ledger = emptyLedger(dayKey(DAY1));
    recordAccept(ledger, ID_A, "manual", DAY1);
    expect(ledger.count).toBe(0);
    expect(ledger.items).toEqual([]);
  });
});

describe("readAcceptLedger", () => {
  it("returns an empty ledger for missing or malformed storage", () => {
    expect(readAcceptLedger(undefined, DAY1)).toEqual(emptyLedger(dayKey(DAY1)));
    expect(readAcceptLedger("nope", DAY1)).toEqual(emptyLedger(dayKey(DAY1)));
    expect(readAcceptLedger({ day: 5, items: "x" }, DAY1)).toEqual(emptyLedger(dayKey(DAY1)));
  });

  it("keeps today's stored ledger and drops malformed items", () => {
    const stored = {
      day: dayKey(DAY1),
      count: 3,
      items: [
        { campaignId: ID_A, at: DAY1, source: "manual" },
        { campaignId: 42, at: DAY1 },
        { campaignId: ID_B, at: DAY1, source: "bogus" },
      ],
    };
    const ledger = readAcceptLedger(stored, DAY1);
    expect(ledger.count).toBe(3);
    expect(ledger.items).toEqual([
      { campaignId: ID_A, at: DAY1, source: "manual" },
      { campaignId: ID_B, at: DAY1, source: "manual" },
    ]);
  });

  it("rolls a stale stored ledger over to today", () => {
    const stored = {
      day: dayKey(DAY1),
      count: 3,
      items: [{ campaignId: ID_A, at: DAY1, source: "manual" }],
    };
    expect(readAcceptLedger(stored, DAY2)).toEqual(emptyLedger(dayKey(DAY2)));
  });
});

describe("cooldownActive", () => {
  it("is active until the stamp expires", () => {
    const now = DAY1;
    const stamp = { until: now + ACCEPT_BLOCK_COOLDOWN_MS };
    expect(cooldownActive(stamp, now)).toBe(true);
    expect(cooldownActive(stamp, now + ACCEPT_BLOCK_COOLDOWN_MS - 1)).toBe(true);
    expect(cooldownActive(stamp, now + ACCEPT_BLOCK_COOLDOWN_MS)).toBe(false);
  });

  it("ignores missing or malformed stamps", () => {
    expect(cooldownActive(null, DAY1)).toBe(false);
    expect(cooldownActive(undefined, DAY1)).toBe(false);
    expect(cooldownActive({ until: "soon" }, DAY1)).toBe(false);
    expect(cooldownActive({ until: Number.NaN }, DAY1)).toBe(false);
  });

  it("is twelve hours long", () => {
    expect(ACCEPT_BLOCK_COOLDOWN_MS).toBe(12 * 60 * 60 * 1000);
  });
});
