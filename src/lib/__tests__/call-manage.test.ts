import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isBookingId, manageToken, manageUrl, verifyManageToken } from "../call-manage";

const ID = "3f2b8c1e-9d4a-4b6e-8f10-2a7c5d9e1b34";
const OTHER = "11111111-2222-4333-8444-555555555555";
const KEYS = ["SCHEDULING_LINK_SECRET", "EMAIL_UNSUBSCRIBE_SECRET", "CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "SITE_URL", "NEXT_PUBLIC_SITE_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.SCHEDULING_LINK_SECRET = "test-secret-one";
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe("manage tokens", () => {
  it("is deterministic and verifies", () => {
    const t = manageToken(ID);
    expect(t.length).toBeGreaterThan(20);
    expect(manageToken(ID)).toBe(t);
    expect(verifyManageToken(ID, t)).toBe(true);
  });

  it("is case-insensitive on the id but bound to that booking", () => {
    const t = manageToken(ID);
    expect(verifyManageToken(ID.toUpperCase(), t)).toBe(true);
    expect(verifyManageToken(OTHER, t)).toBe(false);
  });

  it("rejects tampered, empty and wrong-secret tokens", () => {
    const t = manageToken(ID);
    expect(verifyManageToken(ID, t.slice(0, -2) + "xx")).toBe(false);
    expect(verifyManageToken(ID, "")).toBe(false);
    process.env.SCHEDULING_LINK_SECRET = "a-different-secret";
    expect(verifyManageToken(ID, t)).toBe(false);
  });

  it("is domain-separated from the raw id hash (cannot be replayed as another token)", () => {
    const naive = crypto.createHmac("sha256", "test-secret-one").update(ID).digest("base64url");
    expect(verifyManageToken(ID, naive)).toBe(false);
  });

  it("refuses to sign anything that is not a booking uuid", () => {
    expect(manageToken("not-a-uuid")).toBe("");
    expect(manageToken("")).toBe("");
    expect(isBookingId(ID)).toBe(true);
    expect(isBookingId("../../etc/passwd")).toBe(false);
  });

  it("falls back through the stable server secrets", () => {
    delete process.env.SCHEDULING_LINK_SECRET;
    expect(manageToken(ID)).toBe("");
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "unsub";
    expect(manageToken(ID)).not.toBe("");
  });
});

describe("manageUrl", () => {
  it("builds a signed, id-bound public URL", () => {
    process.env.SITE_URL = "https://www.example.test/";
    const url = manageUrl(ID)!;
    expect(url.startsWith(`https://www.example.test/booking/manage/${ID}?t=`)).toBe(true);
    const t = decodeURIComponent(url.split("?t=")[1]);
    expect(verifyManageToken(ID, t)).toBe(true);
  });

  it("is null (emails fall back to the dashboard) when no secret is configured", () => {
    delete process.env.SCHEDULING_LINK_SECRET;
    expect(manageUrl(ID)).toBeNull();
  });
});
