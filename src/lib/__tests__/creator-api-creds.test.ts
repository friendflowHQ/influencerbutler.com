import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks -----------------------------------------------------------------
// Only the admin Supabase client is mocked: the encryption is real (driven by a
// CREATOR_API_ENC_KEY set below), so these tests also cover the round trip.

const maybeSingleMock = vi.fn();
const upsertMock = vi.fn();
vi.mock("../supabase/admin", () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: () => maybeSingleMock(),
        }),
      }),
      upsert: (values: unknown, opts: unknown) => upsertMock(values, opts),
    }),
  }),
}));

const USER = "11111111-2222-3333-4444-555555555555";

const UK = {
  host: "amazon.co.uk",
  partnerTag: "butler-21",
  credentialId: "amzn1.application-oa2-client.uk",
  credentialSecret: "uk-secret-value",
  credentialVersion: "3.2",
};

const US_INCOMING = {
  host: "amazon.com",
  partnerTag: "butler-20",
  credentialId: "amzn1.application-oa2-client.us",
  credentialSecret: "us-secret-value",
  credentialVersion: "3.2",
};

function storedRow(hosts: Array<Record<string, unknown>>) {
  maybeSingleMock.mockResolvedValue({ data: { marketplaces: hosts, updated_at: null }, error: null });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CREATOR_API_ENC_KEY = "test-encryption-key-at-least-16-chars";
  upsertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  delete process.env.CREATOR_API_ENC_KEY;
});

describe("saveCreds", () => {
  // The bug this exists to prevent: the extension pushes only the marketplace
  // the user just edited, so replacing the whole array silently deleted every
  // other market's credentials.
  it("keeps marketplaces the caller did not mention", async () => {
    const { encryptSecret, saveCreds } = await import("../creator-api-creds");
    const { credentialSecret, ...ukFields } = UK;
    storedRow([{ ...ukFields, ...encryptSecret(credentialSecret) }]);

    await expect(saveCreds(USER, [US_INCOMING])).resolves.toEqual({ ok: true });

    const written = upsertMock.mock.calls[0][0] as { marketplaces: Array<{ host: string }> };
    expect(written.marketplaces.map((m) => m.host).sort()).toEqual(["amazon.co.uk", "amazon.com"]);
  });

  it("replaces the entry for a host it is given", async () => {
    const { encryptSecret, saveCreds, decryptSecret } = await import("../creator-api-creds");
    storedRow([
      { ...US_INCOMING, partnerTag: "old-tag", ...encryptSecret("old-secret") },
    ]);

    await saveCreds(USER, [US_INCOMING]);

    const written = upsertMock.mock.calls[0][0] as {
      marketplaces: Array<{ host: string; partnerTag: string; secretCipher: string; iv: string; authTag: string }>;
    };
    expect(written.marketplaces).toHaveLength(1);
    expect(written.marketplaces[0].partnerTag).toBe("butler-20");
    expect(decryptSecret(written.marketplaces[0])).toBe("us-secret-value");
  });

  it("never stores the secret in the clear", async () => {
    const { saveCreds } = await import("../creator-api-creds");
    storedRow([]);
    await saveCreds(USER, [US_INCOMING]);
    expect(JSON.stringify(upsertMock.mock.calls[0][0])).not.toContain("us-secret-value");
  });

  // The production failure: without the key there is nothing to encrypt with,
  // so the save must refuse rather than write a half-stored row.
  it("refuses to write when the encryption key is missing", async () => {
    delete process.env.CREATOR_API_ENC_KEY;
    const { saveCreds } = await import("../creator-api-creds");
    await expect(saveCreds(USER, [US_INCOMING])).resolves.toEqual({
      ok: false,
      error: "Server encryption key not configured",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // Assuming "empty" on a read failure would wipe the other marketplaces, which
  // is the very thing the merge exists to prevent.
  it("does not write at all when the existing row cannot be read", async () => {
    const { saveCreds } = await import("../creator-api-creds");
    maybeSingleMock.mockResolvedValue({ data: null, error: { code: "PGRST301" } });
    const result = await saveCreds(USER, [US_INCOMING]);
    expect(result.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("reports a missing table as migration pending", async () => {
    const { saveCreds } = await import("../creator-api-creds");
    maybeSingleMock.mockResolvedValue({ data: null, error: { code: "PGRST205" } });
    await expect(saveCreds(USER, [US_INCOMING])).resolves.toEqual({
      ok: false,
      migrationPending: true,
      error: "Migration not applied yet",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
