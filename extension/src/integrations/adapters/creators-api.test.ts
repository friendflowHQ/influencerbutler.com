import { describe, expect, it } from "vitest";
import {
  guidanceFor,
  normalizeMarketplace,
  normalizePartnerTag,
  precheckCredentials,
} from "./creators-api";

// A valid PA-API access key is 20 uppercase alphanumerics; the secret is 40 chars.
// These example values (Amazon's own docs) pass the local pre-check.
const OK_ACCESS = "AKIAIOSFODNN7EXAMPLE";
const OK_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

// Regression guard for the bug where a blank Marketplace field became the invalid
// PA-API param "www." ("The value www. provided in the request for Marketplace is
// invalid"). normalizeMarketplace must always yield a valid www.-prefixed domain.
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
    expect(normalizeMarketplace("http://amazon.co.jp/gp/bestsellers")).toBe(
      "www.amazon.co.jp",
    );
  });
});

// Regression guard for the bug where a partner tag pasted as "@littleprettyl-20"
// (an Instagram-style handle) went to Amazon verbatim and failed. A real tag has
// no "@" and no spaces.
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

// The local pre-check names the common paste mistakes before a confusing round
// trip to Amazon (which reports all of them as "Access Key ID ... invalid").
describe("precheckCredentials", () => {
  it("passes a well-formed key pair", () => {
    expect(precheckCredentials(OK_ACCESS, OK_SECRET)).toBeNull();
  });

  it("flags whitespace inside a key", () => {
    expect(precheckCredentials("AKIA IOSFODNN7EXAMPL", OK_SECRET)).toMatch(/space or line break/i);
    expect(precheckCredentials(OK_ACCESS, "wJalr XUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")).toMatch(
      /space or line break/i,
    );
  });

  it("detects a Creators-API client id pasted as the access key", () => {
    expect(precheckCredentials("amzn1.application-oa2-client.abc123", OK_SECRET)).toMatch(
      /client id/i,
    );
  });

  it("flags an access key of the wrong length", () => {
    expect(precheckCredentials("SHORTKEY", OK_SECRET)).toMatch(/length/i);
  });

  it("flags a too-short secret", () => {
    expect(precheckCredentials(OK_ACCESS, "tooshort")).toMatch(/too short/i);
  });
});

// Amazon returns the same misleading message for several distinct causes, so the
// classifier keys off the error code / message to give the right next step.
describe("guidanceFor", () => {
  it("maps an unrecognized-client auth error to key-copy guidance", () => {
    expect(guidanceFor(401, "UnrecognizedClientException", "The Access Key ID ... is invalid.")).toMatch(
      /does not recognize this access key/i,
    );
  });

  it("maps a signature mismatch to the secret key", () => {
    expect(guidanceFor(403, "IncompleteSignatureException", "signature")).toMatch(/secret key/i);
  });

  it("maps a partner tag error", () => {
    expect(guidanceFor(400, "InvalidPartnerTag", "partner tag not registered")).toMatch(
      /partner tag/i,
    );
  });

  it("maps a clock-skew error", () => {
    expect(guidanceFor(400, "RequestExpired", "Signature expired: too far in the past")).toMatch(
      /clock/i,
    );
  });

  it("maps throttling", () => {
    expect(guidanceFor(429, "TooManyRequests", "")).toMatch(/throttled/i);
  });

  it("returns null when it has nothing better than Amazon's own message", () => {
    expect(guidanceFor(500, "InternalError", "boom")).toBeNull();
  });
});
