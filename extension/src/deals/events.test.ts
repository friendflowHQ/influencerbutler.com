import { describe, expect, it } from "vitest";
import {
  activeDealEvent,
  findPrimeDayWorkspace,
  retailerOfMarketplace,
  sanitizeDealEvents,
} from "./events";

const T = (iso: string) => Date.parse(iso);

describe("sanitizeDealEvents", () => {
  it("keeps valid events and parses ISO dates", () => {
    const out = sanitizeDealEvents([
      { id: "pd", retailers: ["amazon", "walmart", "amazon"], startsAt: "2026-10-06T00:00:00Z", endsAt: "2026-10-09T00:00:00Z" },
    ]);
    expect(out).toEqual([
      { id: "pd", retailers: ["amazon", "walmart"], startsAt: T("2026-10-06T00:00:00Z"), endsAt: T("2026-10-09T00:00:00Z") },
    ]);
  });

  it("drops malformed entries", () => {
    expect(sanitizeDealEvents("nope")).toEqual([]);
    expect(
      sanitizeDealEvents([
        null,
        { id: "", retailers: ["amazon"], startsAt: 1, endsAt: 2 },
        { id: "a", retailers: ["ebay"], startsAt: 1, endsAt: 2 },
        { id: "b", retailers: ["amazon"], startsAt: 5, endsAt: 2 },
        { id: "c", retailers: ["amazon"], startsAt: "garbage", endsAt: 2 },
      ]),
    ).toEqual([]);
  });
});

describe("activeDealEvent", () => {
  const events = sanitizeDealEvents([
    { id: "pd", retailers: ["amazon"], startsAt: "2026-10-06T00:00:00Z", endsAt: "2026-10-09T00:00:00Z" },
  ]);
  it("is open only inside the window for the retailer", () => {
    expect(activeDealEvent(events, "amazon", T("2026-10-05T23:59:00Z"))).toBeNull();
    expect(activeDealEvent(events, "amazon", T("2026-10-07T12:00:00Z"))?.id).toBe("pd");
    expect(activeDealEvent(events, "amazon", T("2026-10-09T00:00:00Z"))).toBeNull();
    expect(activeDealEvent(events, "walmart", T("2026-10-07T12:00:00Z"))).toBeNull();
  });
  it("tolerates no events", () => {
    expect(activeDealEvent(undefined, "amazon")).toBeNull();
  });
});

describe("findPrimeDayWorkspace", () => {
  it("prefers the known key, then a label", () => {
    expect(findPrimeDayWorkspace([{ key: "x", label: "Prime Day Deals" }, { key: "prime-day", label: "PD" }])?.key).toBe("prime-day");
    expect(findPrimeDayWorkspace([{ key: "x", label: "Prime Day Deals" }])?.key).toBe("x");
    expect(findPrimeDayWorkspace([{ key: "default", label: "Deals" }])).toBeNull();
  });
});

describe("retailerOfMarketplace", () => {
  it("maps walmart marketplaces", () => {
    expect(retailerOfMarketplace("walmart-us")).toBe("walmart");
    expect(retailerOfMarketplace("com")).toBe("amazon");
  });
});
