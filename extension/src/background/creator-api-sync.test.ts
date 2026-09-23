import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushCreatorApiCreds, type VaultEntry } from "./creator-api-sync";

// The whole point of these tests: a push that stored nothing must not be
// recorded as a success. Reading res.ok alone did exactly that for the
// "migration not applied yet" soft-fail, which answers 200, so the retry was
// dropped and the credentials never reached server-side enrichment while the
// in-card Test kept passing.

const ENTRY: VaultEntry = {
  host: "amazon.com",
  partnerTag: "butler-20",
  credentialId: "amzn1.application-oa2-client.abc123",
  credentialSecret: "shhh-secret-value",
  credentialVersion: "3.2",
};

// The sync module reads only the license key out of storage; stub the store
// rather than hand-building a full migrated state shape.
const licenseKey = { current: "IB-LIVE-KEY" as string | null };
vi.mock("../storage/store", () => ({
  getState: () => Promise.resolve({ auth: { licenseKey: licenseKey.current } }),
}));

function mockStorage(key: string | null): void {
  licenseKey.current = key;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve(), remove: () => Promise.resolve() } },
  };
}

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      }),
    ),
  );
}

beforeEach(() => mockStorage("IB-LIVE-KEY"));

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.unstubAllGlobals();
});

describe("pushCreatorApiCreds", () => {
  it("treats a migration-pending 200 as a failure, not a success", async () => {
    mockFetch(200, { ok: false, migrationPending: true, error: "Migration not applied yet" });
    await expect(pushCreatorApiCreds([ENTRY])).resolves.toEqual({
      ok: false,
      reason: "migration",
      message: "Migration not applied yet",
    });
  });

  it("treats an ok:false body on a 200 as a failure", async () => {
    mockFetch(200, { ok: false, error: "server_encryption_unavailable" });
    await expect(pushCreatorApiCreds([ENTRY])).resolves.toEqual({
      ok: false,
      reason: "server",
      message: "server_encryption_unavailable",
    });
  });

  // The exact production failure: CREATOR_API_ENC_KEY missing, so the server
  // cannot encrypt the secret and refuses to store anything.
  it("reports a 503 from the server as a server failure", async () => {
    mockFetch(503, { ok: false, error: "server_encryption_unavailable" });
    await expect(pushCreatorApiCreds([ENTRY])).resolves.toEqual({
      ok: false,
      reason: "server",
      message: "server_encryption_unavailable",
    });
  });

  it("reports a network error distinctly, so the card can say 'check your connection'", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await expect(pushCreatorApiCreds([ENTRY])).resolves.toEqual({ ok: false, reason: "network" });
  });

  it("does not even try when signed out", async () => {
    mockStorage(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(pushCreatorApiCreds([ENTRY])).resolves.toEqual({ ok: false, reason: "signed-out" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports incomplete credentials rather than posting a half-filled entry", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      pushCreatorApiCreds([{ ...ENTRY, credentialSecret: "" }]),
    ).resolves.toEqual({ ok: false, reason: "incomplete" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a real success", async () => {
    mockFetch(200, { ok: true, configured: true, marketplaces: ["amazon.com"] });
    await expect(pushCreatorApiCreds([ENTRY])).resolves.toEqual({ ok: true });
  });
});
