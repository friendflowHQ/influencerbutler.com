import { describe, expect, it } from "vitest";
import type { MessengerRecord } from "../../transport/hud-commands";
import type { InboxCache, StoredRow } from "../cc-messages/inbox-cache";
import { cleanByline } from "./byline";
import { createConversationLookup, desktopToRow } from "./status";

const NOW = Date.UTC(2026, 9, 8);
const DAY = 24 * 60 * 60 * 1000;

function row(brand: string, over: Partial<StoredRow> = {}): StoredRow {
  return {
    brand,
    token: "t",
    lastMsgAt: NOW - 2 * DAY,
    unread: false,
    lastSender: "me",
    checkedFor: NOW - 2 * DAY,
    brandReplied: false,
    iMessaged: true,
    ...over,
  };
}

function inboxOf(rows: Record<string, StoredRow>): InboxCache {
  return { syncedAt: NOW, rows };
}

function rec(brand: string, over: Partial<MessengerRecord> = {}): MessengerRecord {
  return {
    brand,
    brandKey: brand.toLowerCase(),
    threadId: `messengerbutler-${brand.toLowerCase()}`,
    status: "",
    lastSender: "brand",
    lastAt: NOW - DAY,
    brandReplied: true,
    iMessaged: true,
    unread: false,
    ...over,
  };
}

describe("createConversationLookup: states", () => {
  const lookup = createConversationLookup(
    inboxOf({
      "litter robot": row("Litter-Robot", { lastSender: "brand", brandReplied: true, unread: true }),
      hairmax: row("hairmax", { lastSender: "me", brandReplied: false }),
      piufike: row("Piufike", { lastSender: "me", brandReplied: true }),
      godefroy: row("Godefroy", { lastSender: "brand", iMessaged: false, unread: true }),
    }),
  );

  it("labels each relationship", () => {
    expect(lookup.resolve({ brand: "Litter-Robot" }, NOW)).toMatchObject({ state: "brand-responded", label: "Brand responded", tone: "good" });
    expect(lookup.resolve({ brand: "hairmax" }, NOW)).toMatchObject({ state: "messaged", label: "Messaged", tone: "plain" });
    expect(lookup.resolve({ brand: "Piufike" }, NOW)).toMatchObject({ state: "you-replied", label: "You replied" });
    expect(lookup.resolve({ brand: "Godefroy" }, NOW)).toMatchObject({ state: "inbound", label: "Brand messaged you", tone: "good" });
  });

  it("explains itself in the tooltip", () => {
    expect(lookup.resolve({ brand: "hairmax" }, NOW)?.tip).toBe("Messaged: hairmax, last message 2 days ago");
  });

  it("returns null for a brand with no conversation", () => {
    expect(lookup.resolve({ brand: "Nobody" }, NOW)).toBeNull();
    expect(lookup.resolve({}, NOW)).toBeNull();
  });
});

describe("createConversationLookup: matching", () => {
  const lookup = createConversationLookup(
    inboxOf({
      "k kamerio": row("K KAMERIO"),
      "michael todd": row("Michael Todd"),
      "michael todd beauty": row("Michael Todd Beauty", { lastSender: "brand", brandReplied: true }),
      home: row("Home"),
      ghostek: row("Ghostek"),
    }),
  );

  it("matches a given brand across case, punctuation and spacing", () => {
    expect(lookup.resolve({ brand: "kkamerio" }, NOW)?.brand).toBe("K KAMERIO");
    expect(lookup.resolve({ brand: "GHOSTEK" }, NOW)?.brand).toBe("Ghostek");
  });

  it("falls back to the title prefix, longest brand first", () => {
    expect(lookup.resolve({ title: "Michael Todd Beauty Sonic Cleansing Brush" }, NOW)?.brand).toBe("Michael Todd Beauty");
    expect(lookup.resolve({ title: "Ghostek Atomic Slim iPhone Case" }, NOW)?.brand).toBe("Ghostek");
  });

  it("needs a word boundary after the brand", () => {
    expect(lookup.resolve({ title: "Ghosteks are not a brand" }, NOW)).toBeNull();
  });

  it("does not trust a short brand as a title prefix, but does as an explicit brand", () => {
    expect(lookup.resolve({ title: "Home Decor Wall Art Set" }, NOW)).toBeNull();
    expect(lookup.resolve({ brand: "Home" }, NOW)?.brand).toBe("Home");
  });

  it("prefers an explicit brand over the title", () => {
    expect(lookup.resolve({ brand: "Ghostek", title: "Michael Todd Beauty Brush" }, NOW)?.brand).toBe("Ghostek");
  });
});

describe("createConversationLookup: desktop records", () => {
  it("chips a brand the inbox does not have, and flags it as in the app", () => {
    const lookup = createConversationLookup(inboxOf({}), [rec("Litter-Robot")]);
    expect(lookup.resolve({ brand: "Litter Robot" }, NOW)).toMatchObject({
      state: "brand-responded",
      source: "app",
      inApp: true,
    });
  });

  it("prefers the more recent side and remembers the app has the thread", () => {
    const inbox = inboxOf({ "litter robot": row("Litter-Robot", { lastMsgAt: NOW - 10 * DAY, checkedFor: NOW - 10 * DAY }) });
    const lookup = createConversationLookup(inbox, [rec("Litter-Robot", { lastAt: NOW - DAY })]);
    expect(lookup.resolve({ brand: "Litter-Robot" }, NOW)).toMatchObject({ source: "app", inApp: true, state: "brand-responded" });

    const newerInbox = inboxOf({ "litter robot": row("Litter-Robot", { lastMsgAt: NOW - 1, checkedFor: NOW - 1, lastSender: "me", brandReplied: true }) });
    const lookup2 = createConversationLookup(newerInbox, [rec("Litter-Robot", { lastAt: NOW - DAY })]);
    expect(lookup2.resolve({ brand: "Litter-Robot" }, NOW)).toMatchObject({ source: "inbox", inApp: true, state: "you-replied" });
  });

  it("maps a desktop record to a checked row", () => {
    const mapped = desktopToRow(rec("Alpha", { lastSender: "me", brandReplied: false, unread: true }));
    expect(mapped).toMatchObject({ lastSender: "me", brandReplied: false, unread: true, checkedFor: mapped.lastMsgAt });
  });
});

describe("cleanByline", () => {
  it("strips the store and brand prefixes", () => {
    expect(cleanByline("Visit the Ghostek Store")).toBe("Ghostek");
    expect(cleanByline("Brand: Michael Todd")).toBe("Michael Todd");
    expect(cleanByline("Marca: Ghostek")).toBe("Ghostek");
    expect(cleanByline("Visita la tienda de Ghostek")).toBe("Ghostek");
    expect(cleanByline("Visiter la boutique Ghostek")).toBe("Ghostek");
    expect(cleanByline("  Visit   the   Litter-Robot   Store ")).toBe("Litter-Robot");
  });

  it("keeps a bare brand and rejects junk", () => {
    expect(cleanByline("Ghostek")).toBe("Ghostek");
    expect(cleanByline("")).toBeNull();
    expect(cleanByline(null)).toBeNull();
    expect(cleanByline("x".repeat(200))).toBeNull();
  });
});
