import { describe, expect, it } from "vitest";
import type { InboxCache, StoredRow } from "./inbox-cache";
import { buildInboxView, visibleExtras, type DomFact } from "./inbox-view";
import { countMatches, matchesFilter, type RowFacts } from "./triage";

function stored(brand: string, over: Partial<StoredRow> = {}): StoredRow {
  return { brand, token: "t", lastMsgAt: 100, unread: false, lastSender: null, checkedFor: 0, brandReplied: false, iMessaged: false, ...over };
}

const facts = (over: Partial<RowFacts> = {}): RowFacts => ({ unread: false, live: false, pitched: false, ratePct: null, ...over });

const makeFacts = (brand: string, unread: boolean): RowFacts =>
  facts({ unread, live: brand.startsWith("Live"), ratePct: brand.startsWith("Live") ? 12 : null });

describe("buildInboxView", () => {
  const inbox: InboxCache = {
    syncedAt: 1,
    rows: {
      alpha: stored("Alpha", { lastMsgAt: 900 }),
      beta: stored("Beta", { lastMsgAt: 500, unread: true }),
      "live co": stored("Live Co", { lastMsgAt: 700 }),
      gamma: stored("Gamma", { lastMsgAt: 300 }),
    },
  };
  const dom: DomFact[] = [
    { brandKey: "alpha", facts: facts({ unread: true }) },
    { brandKey: "gamma", facts: facts() },
  ];

  it("adds the conversations the drawer does not show, newest first", () => {
    const view = buildInboxView(dom, inbox, makeFacts);
    expect(view.extras.map((e) => e.brand)).toEqual(["Live Co", "Beta"]);
    expect(view.all).toHaveLength(4);
  });

  it("takes the drawer's own unread for rows it shows and the API's for the rest", () => {
    const view = buildInboxView(dom, inbox, makeFacts);
    expect(view.all[0]?.unread).toBe(true); // alpha: DOM says unread although the API says read
    expect(countMatches("unread", view.all)).toBe(2); // alpha (DOM) + beta (API)
    expect(countMatches("live", view.all)).toBe(1);
    expect(countMatches("highrate", view.all)).toBe(1);
  });

  it("is just the drawer's rows when the inbox is empty", () => {
    const view = buildInboxView(dom, { syncedAt: 0, rows: {} }, makeFacts);
    expect(view.extras).toEqual([]);
    expect(view.all).toHaveLength(2);
  });

  it("counts past the drawer's 100-row ceiling", () => {
    const rows: Record<string, StoredRow> = {};
    for (let i = 0; i < 1500; i += 1) rows[`brand ${i}`] = stored(`Brand ${i}`, { lastMsgAt: i, unread: i % 10 === 0 });
    const domRows: DomFact[] = Array.from({ length: 100 }, (_v, i) => ({ brandKey: `brand ${1499 - i}`, facts: facts() }));
    const view = buildInboxView(domRows, { syncedAt: 1, rows }, makeFacts);
    expect(view.all).toHaveLength(1500);
    expect(view.extras).toHaveLength(1400);
    expect(countMatches("unread", view.all)).toBeGreaterThan(100);
  });
});

describe("visibleExtras", () => {
  const items = Array.from({ length: 5 }, (_v, i) => ({
    brandKey: `b${i}`,
    brand: `B${i}`,
    lastMsgAt: 100 - i,
    unread: i % 2 === 0,
    facts: facts({ unread: i % 2 === 0 }),
  }));

  it("keeps what the active filter keeps", () => {
    const { items: kept } = visibleExtras(items, (f) => matchesFilter("unread", f));
    expect(kept.map((e) => e.brand)).toEqual(["B0", "B2", "B4"]);
  });

  it("caps the list and reports how many were cut", () => {
    const out = visibleExtras(items, () => true, 2);
    expect(out.items).toHaveLength(2);
    expect(out.hidden).toBe(3);
  });
});
