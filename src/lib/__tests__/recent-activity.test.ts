import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  composePublicRows,
  logExtensionInstallActivity,
  logTrialStartActivity,
} from "../recent-activity";

const row = (kind: string, createdAt: string) => ({ kind, created_at: createdAt });

describe("composePublicRows", () => {
  it("leads with purchases but keeps trial clicks in the rotation", () => {
    const purchases = { data: [row("purchase", "2026-08-10T00:00:00Z")], error: null };
    const trials = {
      data: [row("trial_click", "2026-08-16T00:00:00Z"), row("trial_click", "2026-08-15T00:00:00Z")],
      error: null,
    };
    const out = composePublicRows(purchases, [trials], 5);
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
    const out = composePublicRows(purchases, [trials], 5);
    expect(out).toHaveLength(5);
    expect(out.map((r) => r.kind)).toEqual([
      "purchase",
      "purchase",
      "trial_click",
      "trial_click",
      "trial_click",
    ]);
  });

  it("backfills with purchases when there aren't enough engagement events", () => {
    const purchases = {
      data: [
        row("purchase", "2026-08-14T00:00:00Z"),
        row("purchase", "2026-08-13T00:00:00Z"),
        row("purchase", "2026-08-12T00:00:00Z"),
      ],
      error: null,
    };
    const trials = { data: [row("trial_click", "2026-08-16T00:00:00Z")], error: null };
    const out = composePublicRows(purchases, [trials], 5);
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
    const out = composePublicRows(purchases, [trials], 3);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.kind)).toEqual(["purchase", "purchase", "trial_click"]);
  });

  it("merges the engagement kinds newest-first after the purchase lead", () => {
    // trial_start, extension_install and trial_click each arrive newest-first
    // from their own query; the merged section must be globally newest-first so
    // the freshest signal of any kind shows first.
    const purchases = { data: [row("purchase", "2026-08-01T00:00:00Z")], error: null };
    const trialStarts = { data: [row("trial_start", "2026-08-20T09:00:00Z")], error: null };
    const installs = {
      data: [row("extension_install", "2026-08-20T11:00:00Z")],
      error: null,
    };
    const trialClicks = { data: [row("trial_click", "2026-08-20T10:00:00Z")], error: null };
    const out = composePublicRows(purchases, [trialStarts, installs, trialClicks], 5);
    expect(out.map((r) => r.kind)).toEqual([
      "purchase",
      "extension_install",
      "trial_click",
      "trial_start",
    ]);
  });

  it("treats a failed per-kind query as empty instead of sinking the response", () => {
    const purchases = { data: null, error: new Error("boom") };
    const trials = { data: [row("trial_click", "2026-08-16T00:00:00Z")], error: null };
    expect(composePublicRows(purchases, [trials], 5)).toHaveLength(1);
    expect(composePublicRows(trials, [purchases], 5)).toHaveLength(1);
    expect(composePublicRows(purchases, [purchases], 5)).toEqual([]);
  });
});

describe("best-effort widget writes", () => {
  const KEY = "SUPABASE_SERVICE_ROLE_KEY";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
    delete process.env[KEY];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  it("no-op safely without a service-role key", async () => {
    // Mirrors the existing best-effort contract: with no DB client available
    // these must resolve to void, never throw, so public flows can't break.
    await expect(
      logExtensionInstallActivity({ geo: { city: "Austin", region: "TX", country: "US" } }),
    ).resolves.toBeUndefined();
    await expect(
      logTrialStartActivity({ geoKey: "user:abc", firstName: "Sam" }),
    ).resolves.toBeUndefined();
  });
});
