import { describe, expect, it } from "vitest";

import { composePublicRows } from "../recent-activity";

const row = (kind: string, createdAt: string) => ({ kind, created_at: createdAt });

describe("composePublicRows", () => {
  it("puts purchases ahead of trial clicks regardless of recency", () => {
    const purchases = { data: [row("purchase", "2026-08-10T00:00:00Z")], error: null };
    const trials = {
      data: [row("trial_click", "2026-08-16T00:00:00Z"), row("trial_click", "2026-08-15T00:00:00Z")],
      error: null,
    };
    const out = composePublicRows(purchases, trials, 5);
    expect(out.map((r) => r.kind)).toEqual(["purchase", "trial_click", "trial_click"]);
  });

  it("caps the combined list at maxCount without dropping purchases", () => {
    const purchases = {
      data: [row("purchase", "2026-08-14T00:00:00Z"), row("purchase", "2026-08-12T00:00:00Z")],
      error: null,
    };
    const trials = {
      data: [
        row("trial_click", "2026-08-16T03:00:00Z"),
        row("trial_click", "2026-08-16T02:00:00Z"),
        row("trial_click", "2026-08-16T01:00:00Z"),
      ],
      error: null,
    };
    const out = composePublicRows(purchases, trials, 3);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.kind)).toEqual(["purchase", "purchase", "trial_click"]);
  });

  it("treats a failed per-kind query as empty instead of sinking the response", () => {
    const purchases = { data: null, error: new Error("boom") };
    const trials = { data: [row("trial_click", "2026-08-16T00:00:00Z")], error: null };
    expect(composePublicRows(purchases, trials, 5)).toHaveLength(1);
    expect(composePublicRows(trials, purchases, 5)).toHaveLength(1);
    expect(composePublicRows(purchases, purchases, 5)).toEqual([]);
  });
});
