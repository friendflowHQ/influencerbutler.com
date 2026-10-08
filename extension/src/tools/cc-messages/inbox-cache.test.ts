import { describe, expect, it } from "vitest";
import type { InboxRow } from "./inbox-api";
import {
  applyThreadStatus,
  conversationState,
  inboxCounts,
  mergeInbox,
  needsThreadCheck,
  normalizeCache,
  pickThreadWork,
  type InboxCache,
  type StoredRow,
} from "./inbox-cache";

function fresh(brand: string, over: Partial<InboxRow> = {}): InboxRow {
  return {
    brand,
    brandKey: brand.toLowerCase(),
    token: `tok-${brand}`,
    lastMsgAt: 200,
    lastReadAt: 100,
    unread: true,
    ...over,
  };
}

function stored(over: Partial<StoredRow> = {}): StoredRow {
  return {
    brand: "A",
    token: "t",
    lastMsgAt: 200,
    unread: false,
    lastSender: null,
    checkedFor: 0,
    brandReplied: false,
    iMessaged: false,
    ...over,
  };
}

describe("mergeInbox", () => {
  it("builds rows for every conversation, keyed by brand key", () => {
    const cache = mergeInbox(null, [fresh("Alpha"), fresh("Beta", { unread: false })], 1000);
    expect(cache.syncedAt).toBe(1000);
    expect(Object.keys(cache.rows).sort()).toEqual(["alpha", "beta"]);
    expect(cache.rows.alpha).toMatchObject({ brand: "Alpha", unread: true, lastSender: null, checkedFor: 0 });
  });

  it("keeps thread status while the last message time is unchanged", () => {
    const prev: InboxCache = {
      syncedAt: 1,
      rows: { alpha: stored({ brand: "Alpha", lastMsgAt: 200, checkedFor: 200, lastSender: "brand", brandReplied: true }) },
    };
    const next = mergeInbox(prev, [fresh("Alpha", { lastMsgAt: 200, unread: false })], 2);
    expect(next.rows.alpha).toMatchObject({ lastSender: "brand", checkedFor: 200, brandReplied: true, unread: false });
  });

  it("re-queues a moved thread but keeps the sticky history", () => {
    const prev: InboxCache = {
      syncedAt: 1,
      rows: {
        alpha: stored({ brand: "Alpha", lastMsgAt: 200, checkedFor: 200, lastSender: "brand", brandReplied: true, iMessaged: true }),
      },
    };
    const next = mergeInbox(prev, [fresh("Alpha", { lastMsgAt: 900 })], 2);
    expect(next.rows.alpha).toMatchObject({ lastSender: null, checkedFor: 0, brandReplied: true, iMessaged: true, lastMsgAt: 900 });
    expect(needsThreadCheck(next.rows.alpha as StoredRow)).toBe(true);
  });

  it("drops conversations Amazon no longer lists", () => {
    const prev: InboxCache = { syncedAt: 1, rows: { gone: stored({ brand: "Gone" }) } };
    expect(mergeInbox(prev, [fresh("Alpha")], 2).rows.gone).toBeUndefined();
  });

  it("keeps the more recent of two conversations that fold to one brand key", () => {
    const cache = mergeInbox(null, [fresh("Alpha", { lastMsgAt: 100, token: "old" }), fresh("Alpha", { lastMsgAt: 500, token: "new" })], 1);
    expect(cache.rows.alpha?.token).toBe("new");
    const reversed = mergeInbox(null, [fresh("Alpha", { lastMsgAt: 500, token: "new" }), fresh("Alpha", { lastMsgAt: 100, token: "old" })], 1);
    expect(reversed.rows.alpha?.token).toBe("new");
  });
});

describe("pickThreadWork / applyThreadStatus", () => {
  const cache: InboxCache = {
    syncedAt: 1,
    rows: {
      old: stored({ brand: "Old", lastMsgAt: 100 }),
      newest: stored({ brand: "Newest", lastMsgAt: 900 }),
      done: stored({ brand: "Done", lastMsgAt: 500, checkedFor: 500 }),
      notoken: stored({ brand: "NoToken", lastMsgAt: 700, token: "" }),
      mid: stored({ brand: "Mid", lastMsgAt: 400 }),
    },
  };

  it("picks unchecked conversations newest first, within the budget", () => {
    expect(pickThreadWork(cache, 2).map((w) => w.key)).toEqual(["newest", "mid"]);
    expect(pickThreadWork(cache, 10).map((w) => w.key)).toEqual(["newest", "mid", "old"]);
    expect(pickThreadWork(cache, 0)).toEqual([]);
  });

  it("applies a thread read and makes history sticky", () => {
    const next = applyThreadStatus(cache, "newest", 900, { lastSender: "brand", lastAt: 900, brandReplied: true, iMessaged: true });
    expect(next.rows.newest).toMatchObject({ lastSender: "brand", checkedFor: 900, brandReplied: true, iMessaged: true });
    expect(needsThreadCheck(next.rows.newest as StoredRow)).toBe(false);
    // The original is not mutated.
    expect(cache.rows.newest?.checkedFor).toBe(0);
  });

  it("ignores a stale read for a thread that has moved on", () => {
    expect(applyThreadStatus(cache, "newest", 800, { lastSender: "me", lastAt: 800, brandReplied: false, iMessaged: true })).toBe(cache);
    expect(applyThreadStatus(cache, "missing", 1, { lastSender: "me", lastAt: 1, brandReplied: false, iMessaged: true })).toBe(cache);
  });
});

describe("inboxCounts", () => {
  it("counts the whole inbox and the unread subset", () => {
    const cache = mergeInbox(null, [fresh("A"), fresh("B", { unread: false }), fresh("C")], 1);
    expect(inboxCounts(cache)).toEqual({ total: 3, unread: 2 });
    expect(inboxCounts({ syncedAt: 0, rows: {} })).toEqual({ total: 0, unread: 0 });
  });
});

describe("normalizeCache", () => {
  it("round-trips a good cache and drops malformed rows", () => {
    const good = mergeInbox(null, [fresh("A")], 5);
    expect(normalizeCache(JSON.parse(JSON.stringify(good)))).toEqual(good);
    const messy = normalizeCache({
      syncedAt: "x",
      rows: { ok: { brand: "Ok", lastMsgAt: 3, lastSender: "robot" }, bad: { brand: 4 }, "": { brand: "Empty" }, nope: null },
    });
    expect(Object.keys(messy.rows)).toEqual(["ok"]);
    expect(messy.rows.ok).toMatchObject({ lastSender: null, lastMsgAt: 3, unread: false });
    expect(messy.syncedAt).toBe(0);
  });

  it("returns an empty cache for junk", () => {
    expect(normalizeCache(null)).toEqual({ syncedAt: 0, rows: {} });
    expect(normalizeCache({ rows: [] })).toEqual({ syncedAt: 0, rows: {} });
  });
});

describe("conversationState", () => {
  it("reads the checked thread status", () => {
    const base = { lastMsgAt: 10, checkedFor: 10 };
    expect(conversationState(stored({ ...base, lastSender: "brand", iMessaged: true, brandReplied: true }))).toBe("brand-responded");
    expect(conversationState(stored({ ...base, lastSender: "brand", iMessaged: false, brandReplied: true }))).toBe("inbound");
    expect(conversationState(stored({ ...base, lastSender: "me", iMessaged: true, brandReplied: true }))).toBe("you-replied");
    expect(conversationState(stored({ ...base, lastSender: "me", iMessaged: true, brandReplied: false }))).toBe("messaged");
  });

  it("treats an unchecked unread thread as the brand having spoken", () => {
    expect(conversationState(stored({ unread: true }))).toBe("inbound");
    expect(conversationState(stored({ unread: true, iMessaged: true }))).toBe("brand-responded");
  });

  it("ignores a stale thread status", () => {
    // Status read at 10, but the thread has since moved to 20.
    expect(conversationState(stored({ lastMsgAt: 20, checkedFor: 10, lastSender: "me", unread: false }))).toBe("conversation");
  });

  it("falls back to a plain conversation when nothing is known", () => {
    expect(conversationState(stored())).toBe("conversation");
  });
});
