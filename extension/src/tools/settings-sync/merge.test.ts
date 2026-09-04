import { describe, it, expect } from "vitest";
import { coerceSyncPayload, diffPayloads, fillEmpty, overwriteWith } from "./merge";
import type { SyncSettingsPayload } from "../../transport/sync-settings";

function payload(over: Partial<SyncSettingsPayload> = {}): SyncSettingsPayload {
  return {
    storefrontHandle: null,
    primaryDeeplinkProvider: null,
    walmartLinkProvider: null,
    affiliateRoutingEnabled: false,
    perCountryTags: {},
    providers: {},
    ...over,
  };
}

describe("fillEmpty", () => {
  it("fills only empty fields and never overwrites an existing value", () => {
    const ext = payload({ storefrontHandle: "mine", perCountryTags: { US: "mine-20" } });
    const app = payload({
      storefrontHandle: "theirs",
      primaryDeeplinkProvider: "linktwin",
      perCountryTags: { US: "theirs-20", UK: "theirs-21" },
    });
    const { merged, filled } = fillEmpty(ext, app);
    expect(merged.storefrontHandle).toBe("mine"); // not clobbered
    expect(merged.primaryDeeplinkProvider).toBe("linktwin"); // was empty -> filled
    expect(merged.perCountryTags.US).toBe("mine-20"); // not clobbered
    expect(merged.perCountryTags.UK).toBe("theirs-21"); // was missing -> filled
    expect(filled).toBe(2);
  });

  it("adopts a brand-new provider wholesale but only fills blank cred fields on an existing one", () => {
    const ext = payload({
      providers: { linktwin: { enabled: true, routingParticipates: true, creds: { apiKey: "" } } },
    });
    const app = payload({
      providers: {
        linktwin: { enabled: true, routingParticipates: true, creds: { apiKey: "KEY" } },
        geniuslink: { enabled: true, routingParticipates: true, creds: { apiKey: "G", apiSecret: "S" } },
      },
    });
    const { merged, filled } = fillEmpty(ext, app);
    expect(merged.providers.linktwin.creds.apiKey).toBe("KEY"); // blank -> filled
    expect(merged.providers.geniuslink.creds.apiSecret).toBe("S"); // new provider adopted
    expect(filled).toBe(2);
  });

  it("does not touch booleans", () => {
    const { merged, filled } = fillEmpty(
      payload({ affiliateRoutingEnabled: false }),
      payload({ affiliateRoutingEnabled: true }),
    );
    expect(merged.affiliateRoutingEnabled).toBe(false);
    expect(filled).toBe(0);
  });
});

describe("overwriteWith", () => {
  it("takes the incoming value on a conflict but keeps base where incoming is blank", () => {
    const ext = payload({ storefrontHandle: "mine", primaryDeeplinkProvider: "influencerbutler" });
    const app = payload({ storefrontHandle: "theirs" });
    const { merged, changed } = overwriteWith(ext, app);
    expect(merged.storefrontHandle).toBe("theirs");
    expect(merged.primaryDeeplinkProvider).toBe("influencerbutler"); // incoming blank: kept
    expect(changed).toBe(1);
  });

  it("takes the incoming boolean", () => {
    const { merged, changed } = overwriteWith(
      payload({ affiliateRoutingEnabled: false }),
      payload({ affiliateRoutingEnabled: true }),
    );
    expect(merged.affiliateRoutingEnabled).toBe(true);
    expect(changed).toBe(1);
  });
});

describe("diffPayloads", () => {
  it("lists only genuine conflicts (both sides non-blank and differing)", () => {
    const ext = payload({
      storefrontHandle: "mine",
      perCountryTags: { US: "a-20" },
      providers: { linktwin: { enabled: true, routingParticipates: true, creds: { apiKey: "A" } } },
    });
    const app = payload({
      storefrontHandle: "theirs",
      primaryDeeplinkProvider: "linktwin", // one-sided, not a conflict
      perCountryTags: { US: "b-20" },
      providers: { linktwin: { enabled: true, routingParticipates: true, creds: { apiKey: "B" } } },
    });
    const diffs = diffPayloads(ext, app);
    expect(diffs).toContain("Storefront handle");
    expect(diffs).toContain("US affiliate tag");
    expect(diffs).toContain("linktw.in credentials");
    expect(diffs).not.toContain("Primary deeplink provider");
  });
});

describe("coerceSyncPayload", () => {
  it("returns a safe payload from a partial/garbage object", () => {
    const out = coerceSyncPayload({
      storefrontHandle: "  ",
      perCountryTags: { US: "tag", XX: 5 },
      providers: { linktwin: { creds: { apiKey: "K", bad: 3 } } },
    });
    expect(out).not.toBeNull();
    expect(out!.storefrontHandle).toBeNull(); // blank -> null
    expect(out!.perCountryTags).toEqual({ US: "tag" }); // non-string dropped
    expect(out!.providers.linktwin.creds).toEqual({ apiKey: "K" });
    expect(out!.providers.linktwin.routingParticipates).toBe(true); // default
  });

  it("rejects a non-object", () => {
    expect(coerceSyncPayload(null)).toBeNull();
    expect(coerceSyncPayload("x")).toBeNull();
  });
});
