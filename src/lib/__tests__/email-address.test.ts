/**
 * Summary: Unit tests for the reserved-test-address guard used by the send and
 * enroll paths.
 * Dependencies: vitest, ../email-address.
 */

import { describe, it, expect } from "vitest";
import { isUndeliverableTestEmail } from "../email-address";

describe("isUndeliverableTestEmail", () => {
  it("flags the reserved second-level test domains", () => {
    expect(isUndeliverableTestEmail("drip-test@example.com")).toBe(true);
    expect(isUndeliverableTestEmail("a@example.net")).toBe(true);
    expect(isUndeliverableTestEmail("a@example.org")).toBe(true);
  });

  it("flags reserved / non-routable TLDs", () => {
    expect(isUndeliverableTestEmail("a@foo.test")).toBe(true);
    expect(isUndeliverableTestEmail("a@foo.invalid")).toBe(true);
    expect(isUndeliverableTestEmail("a@anything.example")).toBe(true);
    expect(isUndeliverableTestEmail("a@localhost")).toBe(true);
  });

  it("is case-insensitive on the domain", () => {
    expect(isUndeliverableTestEmail("Drip-Test@Example.COM")).toBe(true);
  });

  it("allows real deliverable addresses", () => {
    expect(isUndeliverableTestEmail("creator@gmail.com")).toBe(false);
    expect(isUndeliverableTestEmail("hello@influencerbutler.com")).toBe(false);
    // A real domain that merely contains "test" is fine.
    expect(isUndeliverableTestEmail("user@test.com")).toBe(false);
    // "example" as a subdomain label, not the domain, is fine.
    expect(isUndeliverableTestEmail("user@example.co")).toBe(false);
  });

  it("returns false for malformed / empty input", () => {
    expect(isUndeliverableTestEmail("")).toBe(false);
    expect(isUndeliverableTestEmail("no-at-sign")).toBe(false);
    expect(isUndeliverableTestEmail("trailing@")).toBe(false);
  });
});
