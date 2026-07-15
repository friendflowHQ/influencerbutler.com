import { describe, expect, it } from "vitest";
import { DEFAULTS, migrate, type StorageShape } from "./schema";

describe("migrate", () => {
  it("returns fresh defaults for empty or version-less state", () => {
    expect(migrate(undefined).schemaVersion).toBe(DEFAULTS.schemaVersion);
    expect(migrate({}).schemaVersion).toBe(DEFAULTS.schemaVersion);
  });

  it("backfills the campaignRadar thresholds + tool flag onto v5 state", () => {
    // A v5 store predates Campaign Radar: it has no campaignRadar threshold
    // object and no campaignRadar tool flag. Migration must add both without
    // disturbing the user's other saved settings.
    const v5 = {
      schemaVersion: 5,
      settings: {
        ...structuredClone(DEFAULTS.settings),
        commissionRatePct: 7.5, // a user-customized value that must survive
      },
    } as unknown as Partial<StorageShape>;
    // Simulate the pre-v6 shape: strip the new keys the way old storage lacked
    // them (v5 also predates settings.creatorMode, added in v7).
    delete (v5.settings as Record<string, unknown>).campaignRadar;
    delete (v5.settings as { tools: Record<string, unknown> }).tools.campaignRadar;
    delete (v5.settings as Record<string, unknown>).creatorMode;

    const out = migrate(v5);
    expect(out.schemaVersion).toBe(DEFAULTS.schemaVersion);
    expect(out.settings.commissionRatePct).toBe(7.5);
    expect(out.settings.campaignRadar).toEqual(DEFAULTS.settings.campaignRadar);
    expect(out.settings.tools.campaignRadar).toBe(true);
    // creatorMode backfills to "both" so an upgraded install stays unfiltered.
    expect(out.settings.creatorMode).toBe("both");
  });

  it("preserves a user's partial campaignRadar overrides and fills the rest", () => {
    const partial = {
      schemaVersion: 6,
      settings: {
        ...structuredClone(DEFAULTS.settings),
        campaignRadar: { minCommissionPct: 25 } as never,
      },
    } as unknown as Partial<StorageShape>;

    const out = migrate(partial);
    expect(out.settings.campaignRadar.minCommissionPct).toBe(25);
    // The unspecified floors fall back to defaults.
    expect(out.settings.campaignRadar.minDaysRemaining).toBe(
      DEFAULTS.settings.campaignRadar.minDaysRemaining,
    );
    expect(out.settings.campaignRadar.minRemainingBudget).toBe(
      DEFAULTS.settings.campaignRadar.minRemainingBudget,
    );
  });
});
