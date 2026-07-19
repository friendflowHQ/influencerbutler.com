import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureSignupReferral,
  isEligibleNewAccount,
  SIGNUP_REFERRAL_MAX_ACCOUNT_AGE_MS,
} from "../referral-signup-capture";

// --- Mocks -----------------------------------------------------------------
// The helper composes three collaborators: the cookie reader (passed in), the
// affiliate owner lookup, and the admin Supabase client. We mock the latter
// two at module level and drive scenarios through their return values.

const lookupMock = vi.fn();
vi.mock("../affiliate-lookup", () => ({
  lookupAffiliateOwnerByCode: (code: string) => lookupMock(code),
}));

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
      upsert: (values: unknown, options: unknown) => upsertMock(values, options),
    }),
  }),
}));

function cookieStoreWith(code: string | null) {
  return {
    get: (name: string) =>
      name === "ib_aff_src" && code ? { value: code } : undefined,
  };
}

const NOW = new Date("2026-07-19T12:00:00.000Z");

function baseArgs(overrides: Partial<Parameters<typeof captureSignupReferral>[0]> = {}) {
  return {
    userId: "new-user-id",
    userCreatedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    userEmail: "new@example.com",
    cookieStore: cookieStoreWith("samantha"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  lookupMock.mockResolvedValue({
    affiliateUserId: "affiliate-id",
    lsAffiliateId: null,
    code: "samantha",
  });
  maybeSingleMock.mockResolvedValue({ data: { ref_affiliate_user_id: null }, error: null });
  upsertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("isEligibleNewAccount", () => {
  it("accepts an account created just now and rejects one past the window", () => {
    const nowMs = NOW.getTime();
    expect(isEligibleNewAccount(new Date(nowMs - 1000).toISOString(), nowMs)).toBe(true);
    expect(
      isEligibleNewAccount(
        new Date(nowMs - SIGNUP_REFERRAL_MAX_ACCOUNT_AGE_MS - 1000).toISOString(),
        nowMs,
      ),
    ).toBe(false);
  });

  it("rejects missing or malformed timestamps", () => {
    expect(isEligibleNewAccount(null, NOW.getTime())).toBe(false);
    expect(isEligibleNewAccount("garbage", NOW.getTime())).toBe(false);
  });
});

describe("captureSignupReferral guards", () => {
  it("does nothing without the ib_aff_src cookie", async () => {
    await captureSignupReferral(baseArgs({ cookieStore: cookieStoreWith(null) }));
    expect(lookupMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("does nothing for an old account (magic-link login, not a signup)", async () => {
    await captureSignupReferral(
      baseArgs({
        userCreatedAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
    expect(lookupMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("does nothing when the code doesn't belong to a real affiliate", async () => {
    lookupMock.mockResolvedValue(null);
    await captureSignupReferral(baseArgs());
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("does nothing on self-referral", async () => {
    lookupMock.mockResolvedValue({
      affiliateUserId: "new-user-id",
      lsAffiliateId: null,
      code: "samantha",
    });
    await captureSignupReferral(baseArgs());
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("is first-touch: does not overwrite an existing stamp", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { ref_affiliate_user_id: "earlier-affiliate" },
      error: null,
    });
    await captureSignupReferral(baseArgs());
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("skips quietly when the profiles read errors (migration not applied)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "column missing" } });
    await captureSignupReferral(baseArgs());
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("captureSignupReferral happy path", () => {
  it("upserts the stamp with the canonical uppercased code, keyed on id", async () => {
    await captureSignupReferral(baseArgs());

    // Cookie value is uppercased before the lookup.
    expect(lookupMock).toHaveBeenCalledWith("SAMANTHA");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [values, options] = upsertMock.mock.calls[0];
    expect(values).toEqual({
      id: "new-user-id",
      email: "new@example.com",
      ref_affiliate_user_id: "affiliate-id",
      ref_affiliate_code: "SAMANTHA",
      ref_captured_at: NOW.toISOString(),
    });
    expect(options).toEqual({ onConflict: "id" });
  });

  it("stamps a profile row that doesn't exist yet (maybeSingle returns null data)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    await captureSignupReferral(baseArgs());
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("swallows upsert failures instead of throwing into the auth flow", async () => {
    upsertMock.mockResolvedValue({ error: { message: "boom" } });
    await expect(captureSignupReferral(baseArgs())).resolves.toBeUndefined();
  });
});
