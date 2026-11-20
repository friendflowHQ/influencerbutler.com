import { describe, expect, it } from "vitest";
import { formatEnds, isBatchStopper, orderItems, selectedIds, summarize, type SheetItem } from "./accept-sheet-model";

const item = (id: string, score: number, ratePct: number | null = null): SheetItem => ({
  id,
  title: id,
  brand: null,
  ratePct,
  endsAt: null,
  score,
});

describe("accept sheet model", () => {
  it("orders by score, then rate, then page order, and caps", () => {
    const ordered = orderItems([item("a", 50, 5), item("b", 80), item("c", 50, 9), item("d", 50, 5)], 3);
    expect(ordered.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("handles a zero or negative cap", () => {
    expect(orderItems([item("a", 1)], 0)).toEqual([]);
    expect(orderItems([item("a", 1)], -3)).toEqual([]);
  });

  it("recognizes batch-stopping reasons", () => {
    expect(isBatchStopper("blocked")).toBe(true);
    expect(isBatchStopper("cooldown")).toBe(true);
    expect(isBatchStopper("disabled")).toBe(true);
    expect(isBatchStopper("needs-id")).toBe(false);
    expect(isBatchStopper(undefined)).toBe(false);
  });

  it("selects only checked ids, in sheet order", () => {
    const items = [item("a", 3), item("b", 2), item("c", 1)];
    expect(selectedIds(items, new Set(["c", "a"]))).toEqual(["a", "c"]);
    expect(selectedIds(items, new Set())).toEqual([]);
  });

  it("summarizes statuses", () => {
    expect(summarize(["done", "done", "failed", "skipped", "waiting"])).toEqual({ done: 2, failed: 1, skipped: 1, total: 5 });
  });

  it("formats end dates and rejects bad ones", () => {
    expect(formatEnds(null, "en")).toBeNull();
    expect(formatEnds("nope", "en")).toBeNull();
    expect(formatEnds("2026-11-30T12:00:00Z", "en")).toMatch(/30/);
  });
});
