import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationState } from "../storage/schema";

// A creator connected to Mavely / Walmart Creator in the desktop app must not be
// asked to connect again in the extension. These cover the three places that
// promise that: a sync records the app's verdict (and the card reads as connected),
// Test accepts the app's connection when this browser has no session, and link
// minting falls back to the app only after this browser's own session failed.

const providers: Record<string, IntegrationState> = {};
const global = {
  testOnStartup: false,
  affiliateRoutingEnabled: true,
  useHighestCommission: false,
  routingProviders: {},
  primaryDeeplinkProvider: null as string | null,
  walmartLinkProvider: "mavely" as string | null,
  perCountryTags: {},
  appOpeningLinks: true,
};

const blank = (): IntegrationState => ({
  enabled: false,
  credentialsEnc: null,
  lastTest: { status: "untested", at: null, message: null },
  routingParticipates: true,
});

vi.mock("../storage/store", () => ({
  getIntegrations: () => Promise.resolve({ global, providers }),
  getIntegration: (id: string) => Promise.resolve(providers[id] ?? blank()),
  getSettings: () => Promise.resolve({ storefrontHandle: null }),
  getState: () => Promise.resolve({ auth: { licenseKey: null }, settings: { storefrontHandle: null } }),
  patchIntegration: (id: string, patch: (s: IntegrationState) => void) => {
    const next = { ...blank(), ...(providers[id] ?? {}) };
    patch(next);
    providers[id] = next;
    return Promise.resolve(next);
  },
  patchIntegrationsGlobal: () => Promise.resolve(),
  patchSettings: () => Promise.resolve(),
}));

const fetchDesktopSettings = vi.fn();
const mintViaDesktop = vi.fn();
vi.mock("./hud-bridge", () => ({ fetchDesktopSettings, mintViaDesktop }));
vi.mock("./links", () => ({ maybePublishGeneratedLink: vi.fn() }));
vi.mock("./creator-api-sync", () => ({
  clearCreatorApiVault: vi.fn(),
  fetchVaultStatus: vi.fn(),
  getVaultSyncState: () => Promise.resolve(null),
  isVaultSyncPending: () => Promise.resolve(false),
  pushCreatorApiCreds: vi.fn(),
  setVaultSyncState: vi.fn(),
}));

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const emptyPayload = {
  storefrontHandle: null,
  primaryDeeplinkProvider: null,
  walmartLinkProvider: null,
  affiliateRoutingEnabled: false,
  perCountryTags: {},
  providers: {},
};

async function load() {
  return import("./integrations");
}

beforeEach(() => {
  for (const k of Object.keys(providers)) delete providers[k];
  global.walmartLinkProvider = "mavely";
  fetchDesktopSettings.mockReset();
  mintViaDesktop.mockReset();
  vi.unstubAllGlobals();
});

describe("applyDesktopConnections + the integrations view", () => {
  it("shows a provider connected in the app as configured, via the app, with its account", async () => {
    const { applyDesktopConnections, buildIntegrationsView } = await load();
    await applyDesktopConnections({ mavely: { connected: true, label: "me@example.com" } });
    const view = await buildIntegrationsView();
    const mavely = view.providers.find((p) => p.id === "mavely")!;
    expect(mavely.configured).toBe(true);
    expect(mavely.viaDesktop).toEqual({ label: "me@example.com" });
    // The app's verdict never flips this browser's own enabled flag.
    expect(mavely.enabled).toBe(false);
    // The other session provider had no verdict: untouched.
    const creator = view.providers.find((p) => p.id === "walmartCreator")!;
    expect(creator.configured).toBe(false);
    expect(creator.viaDesktop).toBeUndefined();
  });

  it("reverts to not connected when the app reports it signed out", async () => {
    const { applyDesktopConnections, buildIntegrationsView } = await load();
    await applyDesktopConnections({ mavely: { connected: true } });
    await applyDesktopConnections({ mavely: { connected: false } });
    const mavely = (await buildIntegrationsView()).providers.find((p) => p.id === "mavely")!;
    expect(mavely.configured).toBe(false);
    expect(mavely.viaDesktop).toBeUndefined();
  });

  it("leaves a provider alone when the app sent no verdict for it", async () => {
    const { applyDesktopConnections, buildIntegrationsView } = await load();
    await applyDesktopConnections({ mavely: { connected: true } });
    await applyDesktopConnections({}); // an older app / nothing probed yet
    await applyDesktopConnections(undefined);
    const mavely = (await buildIntegrationsView()).providers.find((p) => p.id === "mavely")!;
    expect(mavely.configured).toBe(true);
  });

  it("drops the via-app note once this browser has its own passing session", async () => {
    const { applyDesktopConnections, buildIntegrationsView } = await load();
    await applyDesktopConnections({ mavely: { connected: true } });
    providers.mavely!.lastTest = { status: "ok", at: Date.now(), message: "Connected to Mavely." };
    const mavely = (await buildIntegrationsView()).providers.find((p) => p.id === "mavely")!;
    expect(mavely.configured).toBe(true);
    expect(mavely.viaDesktop).toBeUndefined();
  });

  it("does not credit the app for non-session providers", async () => {
    const { applyDesktopConnections, buildIntegrationsView } = await load();
    await applyDesktopConnections({ levanta: { connected: true } } as never);
    const levanta = (await buildIntegrationsView()).providers.find((p) => p.id === "levanta")!;
    expect(levanta.configured).toBe(false);
  });
});

describe("testIntegration", () => {
  it("accepts the app's connection when this browser is signed out of Mavely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    fetchDesktopSettings.mockResolvedValue({
      status: "ok",
      payload: { ...emptyPayload, sessionConnections: { mavely: { connected: true, label: "me@example.com" } } },
    });
    const { testIntegration } = await load();
    const outcome = await testIntegration("mavely");
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("Influencer Butler app");
    expect(outcome.message).toContain("me@example.com");
    expect(providers.mavely!.enabled).toBe(true);
  });

  it("still fails when the app is signed out too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    fetchDesktopSettings.mockResolvedValue({
      status: "ok",
      payload: { ...emptyPayload, sessionConnections: { mavely: { connected: false } } },
    });
    const { testIntegration } = await load();
    const outcome = await testIntegration("mavely");
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("creators.joinmavely.com");
  });

  it("still fails when the app is closed, not paired, or has no verdict", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    const { testIntegration } = await load();
    for (const answer of [
      { status: "app-unavailable" },
      { status: "not-paired" },
      { status: "ok", payload: emptyPayload }, // older app: no sessionConnections
    ]) {
      fetchDesktopSettings.mockResolvedValue(answer);
      expect((await testIntegration("mavely")).ok).toBe(false);
    }
  });

  it("does not consult the app when this browser's own session passes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { user: { email: "local@example.com" } })),
    );
    const { testIntegration } = await load();
    const outcome = await testIntegration("mavely");
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("local@example.com");
    expect(fetchDesktopSettings).not.toHaveBeenCalled();
  });
});

describe("generateAffiliateLink (Walmart)", () => {
  it("mints through the app after this browser's session failed, and keeps the link clean", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    mintViaDesktop.mockResolvedValue({ status: "ok", url: "https://mave.ly/fromapp" });
    const { generateAffiliateLink } = await load();
    const res = await generateAffiliateLink("10450114", "walmart.com", "https://www.walmart.com/ip/10450114", "walmart");
    expect(res).toEqual({ ok: true, url: "https://mave.ly/fromapp", notice: undefined });
    expect(mintViaDesktop).toHaveBeenCalledWith("mavely", "https://www.walmart.com/ip/10450114");
  });

  it("records that the app is signed out when it says so, and still hands back a plain link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    mintViaDesktop.mockResolvedValue({ status: "needs-signin", message: "Sign in in the app." });
    const { generateAffiliateLink, applyDesktopConnections } = await load();
    await applyDesktopConnections({ mavely: { connected: true } });
    const res = await generateAffiliateLink("10450114", "walmart.com", "https://www.walmart.com/ip/10450114", "walmart");
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://www.walmart.com/ip/10450114");
    expect(res.notice).toBe("signInRequired");
    expect(providers.mavely!.desktopConnection?.connected).toBe(false);
  });

  it("never asks the app for a non-session provider", async () => {
    global.walmartLinkProvider = null;
    const { generateAffiliateLink } = await load();
    const res = await generateAffiliateLink("10450114", "walmart.com", "https://www.walmart.com/ip/10450114", "walmart");
    expect(res.url).toBe("https://www.walmart.com/ip/10450114");
    expect(mintViaDesktop).not.toHaveBeenCalled();
  });
});
