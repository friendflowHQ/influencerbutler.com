/**
 * Summary: Unit tests for the call -> support-ticket extractor.
 * Dependencies: vitest, ../call-tickets. The LLM fetch is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeItems, extractSupportItems, isCallTicketsConfigured } from "../call-tickets";

describe("normalizeItems", () => {
  it("keeps valid items, defaults type to bug, caps title, drops titleless", () => {
    const items = normalizeItems({
      items: [
        { type: "bug", title: "CSV export drops last row", description: "Happens on Walmart lists." },
        { type: "feature", title: "Bulk-tag on Walmart", description: "" },
        { type: "nonsense", title: "No type given", description: "x" },
        { title: "", description: "no title, dropped" },
        { description: "no title key at all" },
      ],
    });
    expect(items).toEqual([
      { type: "bug", title: "CSV export drops last row", description: "Happens on Walmart lists." },
      { type: "feature", title: "Bulk-tag on Walmart", description: "" },
      { type: "bug", title: "No type given", description: "x" },
    ]);
  });

  it("accepts a bare array too", () => {
    expect(normalizeItems([{ type: "feature", title: "Dark mode", description: "" }])).toEqual([
      { type: "feature", title: "Dark mode", description: "" },
    ]);
  });

  it("returns [] for empty / malformed input", () => {
    expect(normalizeItems({ items: [] })).toEqual([]);
    expect(normalizeItems({})).toEqual([]);
    expect(normalizeItems(null)).toEqual([]);
    expect(normalizeItems("nope")).toEqual([]);
  });

  it("caps the number of items", () => {
    const many = { items: Array.from({ length: 20 }, (_, i) => ({ type: "bug", title: `t${i}`, description: "" })) };
    expect(normalizeItems(many).length).toBe(6);
  });
});

describe("extractSupportItems", () => {
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.OPENAI_API_KEY;
    delete process.env.CALL_TICKETS_MODEL;
  });
  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
  });

  function stubChat(content: string) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns a bug + a feature from a transcript that raised both", async () => {
    stubChat(JSON.stringify({
      items: [
        { type: "bug", title: "Export drops last row", description: "Repro on Walmart lists." },
        { type: "feature", title: "Bulk-tag products", description: "Asked for on the call." },
      ],
    }));
    const items = await extractSupportItems("Host: hi\nCustomer: export is broken and I want bulk tag", {
      callType: "support",
      topic: "issues",
      summary: "customer hit an export bug",
    });
    expect(items.map((i) => i.type)).toEqual(["bug", "feature"]);
    expect(items[0].title).toBe("Export drops last row");
  });

  it("returns [] when nothing qualifies", async () => {
    stubChat(JSON.stringify({ items: [] }));
    const items = await extractSupportItems("just small talk about the weather", { callType: "demo" });
    expect(items).toEqual([]);
  });

  it("returns [] when no provider key is configured", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(isCallTicketsConfigured()).toBe(false);
    expect(await extractSupportItems("anything", { callType: "support" })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns [] and does not throw on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    expect(await extractSupportItems("x", { callType: "support" })).toEqual([]);
  });

  it("returns [] on an empty transcript without calling the model", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await extractSupportItems("   ", { callType: "support" })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
