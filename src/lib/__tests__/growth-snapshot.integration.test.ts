/**
 * Summary: TEMPORARY read-only integration check - runs computeGrowthSnapshot
 * against the configured Supabase project to validate table/column names.
 * Deleted after verification; skips itself when env is absent.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createAdminClient } from "../admin";
import { computeGrowthSnapshot, monthKey, type SnapshotClient } from "../growth-metrics";

function loadEnvLocal(): void {
  try {
    const file = readFileSync(path.resolve(__dirname, "../../../.env.local"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // no env file; test will skip
  }
}

describe("growth snapshot integration (read-only)", () => {
  loadEnvLocal();
  const enabled = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  it.skipIf(!enabled)("queries every metric without schema errors", async () => {
    const supabase = createAdminClient() as unknown as SnapshotClient | null;
    expect(supabase).not.toBeNull();

    const month = monthKey(new Date());
    const snapshot = await computeGrowthSnapshot(supabase!, month);
    expect(snapshot).not.toBeNull();

    const summary: Record<string, unknown> = { month, migrationPending: snapshot!.migrationPending };
    for (const [key, snap] of Object.entries(snapshot!.metrics)) {
      summary[key] = `${snap.current} (prev ${snap.previous})`;
    }
    console.log(JSON.stringify(summary, null, 2));

    // A null current means that metric's query failed against the live schema.
    const mustWork = [
      "trial_clicks",
      "trials_started",
      "new_subscriptions",
      "active_subscriptions",
      "on_trial_subscriptions",
      "revenue_cents",
      "affiliate_signups",
      "affiliate_clicks",
      "testimonials",
      "email_subscribers",
      "commission_paid_cents",
      "commission_owed_cents",
    ];
    for (const key of mustWork) {
      expect(snapshot!.metrics[key]?.current, `metric ${key}`).not.toBeNull();
    }
  });
});
