/**
 * Tests for the dual-auth helper that powers both website Q&A routes
 * (session OR license-bearer) and the desktop-app admin probe
 * (license-bearer only).
 *
 * The full resolveAuth + resolveLicenseOnly paths require Supabase
 * mocking; those are covered by route-level integration tests. Here we
 * focus on the pure helpers - hashLicenseKey + isEmailAdmin - that the
 * route handlers rely on.
 */

import { describe, expect, it, afterEach } from "vitest";
import { hashLicenseKey, isEmailAdmin } from "../license-auth";

describe("hashLicenseKey", () => {
  it("produces a deterministic 64-char hex hash", () => {
    const out = hashLicenseKey("test-license-key");
    expect(out).toMatch(/^[a-f0-9]{64}$/);
    expect(hashLicenseKey("test-license-key")).toBe(out);
  });

  it("trims whitespace before hashing", () => {
    expect(hashLicenseKey("  test  ")).toBe(hashLicenseKey("test"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashLicenseKey("a")).not.toBe(hashLicenseKey("b"));
  });
});

describe("isEmailAdmin", () => {
  const ORIGINAL_EMAILS = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (ORIGINAL_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = ORIGINAL_EMAILS;
  });

  it("returns false when ADMIN_EMAILS is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isEmailAdmin("anyone@example.com")).toBe(false);
  });

  it("returns false when ADMIN_EMAILS is empty", () => {
    process.env.ADMIN_EMAILS = "";
    expect(isEmailAdmin("anyone@example.com")).toBe(false);
  });

  it("returns false for an email NOT in the allowlist", () => {
    process.env.ADMIN_EMAILS = "admin@influencerbutler.com";
    expect(isEmailAdmin("user@example.com")).toBe(false);
  });

  it("returns true for an email in the allowlist (case-insensitive)", () => {
    process.env.ADMIN_EMAILS = "admin@influencerbutler.com";
    expect(isEmailAdmin("admin@influencerbutler.com")).toBe(true);
    expect(isEmailAdmin("ADMIN@influencerbutler.com")).toBe(true);
    expect(isEmailAdmin("Admin@InfluencerButler.com")).toBe(true);
  });

  it("supports comma-separated multi-admin lists", () => {
    process.env.ADMIN_EMAILS = "a@x.com , b@y.com,c@z.com";
    expect(isEmailAdmin("a@x.com")).toBe(true);
    expect(isEmailAdmin("b@y.com")).toBe(true);
    expect(isEmailAdmin("c@z.com")).toBe(true);
    expect(isEmailAdmin("d@w.com")).toBe(false);
  });

  it("returns false for null/empty email even if allowlist is populated", () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    expect(isEmailAdmin(null)).toBe(false);
    expect(isEmailAdmin(undefined)).toBe(false);
    expect(isEmailAdmin("")).toBe(false);
  });
});
