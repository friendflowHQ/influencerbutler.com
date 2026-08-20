import { describe, expect, it } from "vitest";

import { composePublicRows } from "../recent-activity";

const row = (kind: string, createdAt: string) => ({ kind, created_at: createdAt });

describe("composePublicRows", () => {
  it("leads with purchases but keeps trial clicks in the rotation", () => {
    const purchases = { data: [row("purchase", "2026-08-10T00:00:00Z")], error: null };
    const trials = {
      data: [row("trial_click", "2026-08-16T00:00:00Z"), row("trial_click", "2026-08-15T00:00:00Z")],
      error: null,
    };
    const out = composePublicRows(purchases, trials, 5);
    expect(out.map((r) => r.kind)).toEqual(["purchase", "trial_click", "trial_click"]);
  });

  it("surfaces trial clicks even when purchases already fill maxCount", () => {
    // Regression: a busy sales week (>= maxCount purchases in the 7-day window)
    // used to crowd out every trial click, so the widget cycled purchases only.
    const purchases = {
      data: [
        row("purchase", "2026-08-18T21:00:00Z"),
        row("purchase", "2026-08-18T20:00:00Z"),
        row("purchase", "2026-08-18T19:00:00Z"),
        row("purchase", "2026-08-16T21:00:00Z"),
        row("purchase", "2026-08-16T02:00:00Z"),
      ],
      error: null,
    };
    const trials = {
      data: [
        row("trial_click", "2026-08-20T12:00:00Z"),
        row("trial_click", "2026-08-20T11:00:00Z"),
        row("trial_click", "2026-08-20T10:00:00Z"),
      ],
      error: null,
    };
    const out = composePublicRows(purchases, trials, 5);
    expect(out).toHaveLength(5);
    expect(out.map((r) => r.kind)).toEqual([
      "purchase",
      "purchase",
      "trial_click",
      "trial_click",
      "trial_click",
    ]);
  });

  it("backfills with purchases when there aren't enough trial clicks", () => {
    const purchases = {
      data: [
        row("purchase", "2026-08-14T00:00:00Z"),
        row("purchase", "2026-08-13T00:00:00Z"),
        row("purchase", "2026-08-12T00:00:00Z"),
      ],
      error: null,
    };
    const trials = { data: [row("trial_click", "2026-08-16T00:00:00Z")], error: null };
    const out = composePublicRows(purchases, trials, 5);
    expect(out).toHaveLength(4);
    expect(out.map((r) => r.kind)).toEqual([
      "purchase",
      "purchase",
      "trial_click",
      "purchase",
    ]);
  });

  it("caps the combined list at maxCount", () => {
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
