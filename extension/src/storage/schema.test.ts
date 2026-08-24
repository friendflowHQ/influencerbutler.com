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

  it("backfills the storeOverlay tool flag onto v8 state", () => {
    // A v8 store predates the brand-store overlay: no storeOverlay tool flag.
    const v8 = {
      schemaVersion: 8,
      settings: structuredClone(DEFAULTS.settings),
    } as unknown as Partial<StorageShape>;
    delete (v8.settings as { tools: Record<string, unknown> }).tools.storeOverlay;

    const out = migrate(v8);
    expect(out.schemaVersion).toBe(DEFAULTS.schemaVersion);
    expect(out.settings.tools.storeOverlay).toBe(true);
  });

  it("backfills the trendRadar tool flag onto v9 state", () => {
    // A v9 store predates Trend Radar: no trendRadar tool flag.
    const v9 = {
      schemaVersion: 9,
      settings: structuredClone(DEFAULTS.settings),
    } as unknown as Partial<StorageShape>;
    delete (v9.settings as { tools: Record<string, unknown> }).tools.trendRadar;

    const out = migrate(v9);
    expect(out.schemaVersion).toBe(DEFAULTS.schemaVersion);
    expect(out.settings.tools.trendRadar).toBe(true);
  });

  it("backfills the ideaListOverlay tool flag onto v11 state", () => {
    // A v11 store predates the Idea List overlay: no ideaListOverlay flag.
    const v11 = {
      schemaVersion: 11,
      settings: structuredClone(DEFAULTS.settings),
    } as unknown as Partial<StorageShape>;
    delete (v11.settings as { tools: Record<string, unknown> }).tools.ideaListOverlay;

    const out = migrate(v11);
    expect(out.schemaVersion).toBe(DEFAULTS.schemaVersion);
    expect(out.settings.tools.ideaListOverlay).toBe(true);
  });

  it("drops the Impact Walmart provider and stale Walmart Creator creds on v17 state", () => {
    const v17 = {
      schemaVersion: 17,
      integrations: {
        global: {
          ...structuredClone(DEFAULTS.integrations.global),
          walmartLinkProvider: "impact",
        },
        providers: {
          impact: {
            enabled: true,
            credentialsEnc: { iv: "iv", ct: "ct" },
            lastTest: { status: "ok", at: 1, message: "Connected to Impact." },
            routingParticipates: true,
          },
          walmartCreator: {
            enabled: true,
            credentialsEnc: { iv: "iv2", ct: "ct2" },
            lastTest: { status: "ok", at: 2, message: "Saved." },
            routingParticipates: true,
          },
        },
      },
    } as unknown as Partial<StorageShape>;

    const out = migrate(v17);
    expect(out.schemaVersion).toBe(DEFAULTS.schemaVersion);
    // The Impact provider no longer exists; the selection resets to "none".
    expect(out.integrations.global.walmartLinkProvider).toBeNull();
    expect(out.integrations.providers.impact).toBeUndefined();
    // Walmart Creator is now session-based: its stored manual ids are cleared
    // and its badge resets, but the row itself (enabled flag) survives.
    const creator = out.integrations.providers.walmartCreator!;
    expect(creator.credentialsEnc).toBeNull();
    expect(creator.lastTest.status).toBe("untested");
    expect(creator.enabled).toBe(true);
  });

  it("keeps a stored walmartCreator selection through the v18 migration", () => {
    const v17 = {
      schemaVersion: 17,
      integrations: {
        global: {
          ...structuredClone(DEFAULTS.integrations.global),
          walmartLinkProvider: "walmartCreator",
        },
        providers: {},
      },
    } as unknown as Partial<StorageShape>;

    expect(migrate(v17).integrations.global.walmartLinkProvider).toBe("walmartCreator");
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
