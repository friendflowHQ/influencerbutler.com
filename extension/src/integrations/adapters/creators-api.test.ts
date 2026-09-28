import { describe, expect, it } from "vitest";
import { guidanceFor, normalizeMarketplace, normalizePartnerTag, precheckCredentials } from "./creators-api";

// A real Creator API Credential ID is an amzn1.application-oa2-client... value.
const OK_CREDENTIAL_ID = "amzn1.application-oa2-client.abc123def456";
const OK_SECRET = "amzn1.oa2-cs.v1.0123456789abcdef0123456789abcdef";

// Regression guard for the bug where a blank Marketplace field became the
// invalid param "www.". normalizeMarketplace must always yield a valid
// www.-prefixed domain.
describe("normalizeMarketplace", () => {
  it("defaults blank / whitespace / null / undefined to US", () => {
    expect(normalizeMarketplace("")).toBe("www.amazon.com");
    expect(normalizeMarketplace("   ")).toBe("www.amazon.com");
    expect(normalizeMarketplace(null)).toBe("www.amazon.com");
    expect(normalizeMarketplace(undefined)).toBe("www.amazon.com");
  });

  it("never emits a lone 'www.'", () => {
    expect(normalizeMarketplace("")).not.toBe("www.");
  });

  it("maps the us/usa aliases to US", () => {
    expect(normalizeMarketplace("us")).toBe("www.amazon.com");
    expect(normalizeMarketplace("USA")).toBe("www.amazon.com");
  });

  it("adds a single www. to a bare host", () => {
    expect(normalizeMarketplace("amazon.com")).toBe("www.amazon.com");
    expect(normalizeMarketplace("amazon.co.uk")).toBe("www.amazon.co.uk");
  });

  it("keeps an already www.-prefixed host as-is", () => {
    expect(normalizeMarketplace("www.amazon.com")).toBe("www.amazon.com");
    expect(normalizeMarketplace("WWW.AMAZON.DE")).toBe("www.amazon.de");
  });

  it("strips protocol and path from a pasted store URL", () => {
    expect(normalizeMarketplace("https://www.amazon.com/")).toBe("www.amazon.com");
    expect(normalizeMarketplace("http://amazon.co.jp/gp/bestsellers")).toBe("www.amazon.co.jp");
  });
});

// A real tag has no "@" and no spaces.
describe("normalizePartnerTag", () => {
  it("strips a leading @", () => {
    expect(normalizePartnerTag("@littleprettyl-20")).toBe("littleprettyl-20");
    expect(normalizePartnerTag("@@tag-20")).toBe("tag-20");
  });

  it("trims surrounding and removes interior whitespace", () => {
    expect(normalizePartnerTag("  tag-20 ")).toBe("tag-20");
    expect(normalizePartnerTag("tag -20")).toBe("tag-20");
    expect(normalizePartnerTag("tag-20\n")).toBe("tag-20");
  });

  it("leaves a clean tag untouched and preserves case", () => {
    expect(normalizePartnerTag("tag-20")).toBe("tag-20");
    expect(normalizePartnerTag("MyTag-20")).toBe("MyTag-20");
  });

  it("handles null / undefined", () => {
    expect(normalizePartnerTag(null)).toBe("");
    expect(normalizePartnerTag(undefined)).toBe("");
  });
});

describe("precheckCredentials", () => {
  it("accepts a real amzn1. Credential ID + Secret", () => {
    expect(precheckCredentials(OK_CREDENTIAL_ID, OK_SECRET)).toBeNull();
  });

  it("flags whitespace inside the id or secret", () => {
    expect(precheckCredentials("amzn1.application oa2", OK_SECRET)).toMatch(/space or line break/i);
    expect(precheckCredentials(OK_CREDENTIAL_ID, "amzn1 secret")).toMatch(/space or line break/i);
  });

  it("detects an old PA-API access key pasted as the Credential ID", () => {
    // A 20-char AKIA/ASIA access key is the old PA-API credential, not the new
    // OAuth Credential ID.
    expect(precheckCredentials("AKIAIOSFODNN7EXAMPLE", OK_SECRET)).toMatch(/Product Advertising API access key/i);
  });
});

describe("guidanceFor", () => {
  it("maps an OAuth invalid_client error to credential-copy guidance", () => {
    const g = guidanceFor(401, "invalid_client", "client authentication failed");
    expect(g?.message).toMatch(/did not accept these credentials/i);
    expect(g?.eligibilityBlocked).toBe(false);
  });

  it("maps a partner tag error", () => {
    const g = guidanceFor(400, "InvalidPartnerTag", "partner tag not registered");
    expect(g?.message).toMatch(/partner tag/i);
    expect(g?.eligibilityBlocked).toBe(false);
  });

  it("maps an eligibility 403 to the backup offer path", () => {
    const g = guidanceFor(403, "AccessDenied", "not authorized to access this resource");
    expect(g?.message).toMatch(/has not unlocked the Creator API/i);
    expect(g?.eligibilityBlocked).toBe(true);
  });

  it("returns null when it has nothing better than Amazon's own message", () => {
    expect(guidanceFor(500, "InternalError", "boom")).toBeNull();
  });
});
