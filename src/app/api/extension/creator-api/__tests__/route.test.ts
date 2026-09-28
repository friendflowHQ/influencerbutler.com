/**
 * Summary: Unit tests for POST /api/extension/creator-api - the vault save must
 *   refuse, loudly and distinguishably, when the server cannot encrypt. A
 *   generic 500 (or worse, a 200) is what let a failed save look like a success
 *   to the extension, leaving credentials that pass the in-card Test but never
 *   reach server-side enrichment.
 * Dependencies: vitest, ../route, @/lib/license-auth, @/lib/creator-api-creds.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/license-auth", () => ({
  resolveLicenseOnly: vi.fn(),
}));

const encryptionAvailableMock = vi.fn();
const saveCredsMock = vi.fn();
vi.mock("@/lib/creator-api-creds", () => ({
  encryptionAvailable: () => encryptionAvailableMock(),
  saveCreds: (...args: unknown[]) => saveCredsMock(...args),
  getStatus: () =>
    Promise.resolve({ status: { configured: true, marketplaces: ["amazon.com"], updatedAt: null } }),
  getBackupStatus: () =>
    Promise.resolve({ status: { enabled: false, active: false, expiresAt: null } }),
  deleteCreds: vi.fn(),
  saveBackup: vi.fn(),
  clearBackup: vi.fn(),
  validateIncoming: (raw: Record<string, string>) => raw,
}));

vi.mock("@/lib/creators-backup", () => ({ leaseBackupCreds: vi.fn() }));

import { POST } from "../route";
import { resolveLicenseOnly } from "@/lib/license-auth";

const resolveMock = resolveLicenseOnly as unknown as ReturnType<typeof vi.fn>;

const ENTRY = {
  host: "amazon.com",
  partnerTag: "butler-20",
  credentialId: "amzn1.application-oa2-client.abc",
  credentialSecret: "secret-value-1",
  credentialVersion: "3.2",
};

function request(body: unknown) {
  return new Request("http://localhost/api/extension/creator-api", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer IB-LIVE-KEY" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveMock.mockResolvedValue({ ok: true, auth: { userId: "user-1" } });
  encryptionAvailableMock.mockReturnValue(true);
  saveCredsMock.mockResolvedValue({ ok: true });
});

describe("POST /api/extension/creator-api", () => {
  it("refuses with a distinct code when the server has no encryption key", async () => {
    encryptionAvailableMock.mockReturnValue(false);
    const res = await POST(request({ marketplaces: [ENTRY] }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "server_encryption_unavailable" });
    expect(saveCredsMock).not.toHaveBeenCalled();
  });

  it("marks a save failure ok:false in the body, not just in the status", async () => {
    saveCredsMock.mockResolvedValue({ ok: false, error: "Could not save credentials" });
    const res = await POST(request({ marketplaces: [ENTRY] }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  // The soft-fail answers 200 on purpose, so ok:false in the body is the only
  // thing that stops a client recording a no-op as a success.
  it("keeps a migration-pending save readable as a failure", async () => {
    saveCredsMock.mockResolvedValue({ ok: false, migrationPending: true, error: "x" });
    const res = await POST(request({ marketplaces: [ENTRY] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: false, migrationPending: true });
  });

  it("returns the stored marketplaces on success", async () => {
    const res = await POST(request({ marketplaces: [ENTRY] }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, marketplaces: ["amazon.com"] });
  });
});
