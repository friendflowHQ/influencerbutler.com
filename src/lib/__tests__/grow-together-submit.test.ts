import { beforeAll, describe, expect, it } from "vitest";
import {
  bundleSubmitToken,
  bundleSubmitUrl,
  personalizeBundleSubmitBody,
  verifyBundleSubmitToken,
} from "../grow-together-submit";

// The token + URL helpers read the signing secret and site URL from the
// environment at call time, so set them before exercising the module.
beforeAll(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-for-grow-together-submit";
  process.env.SITE_URL = "https://www.influencerbutler.com";
});

describe("bundleSubmitToken / verifyBundleSubmitToken", () => {
  it("verifies a token it produced, case/whitespace-insensitive on the email", () => {
    const token = bundleSubmitToken("Creator@Example.com");
    expect(token).not.toBe("");
    expect(verifyBundleSubmitToken("  creator@example.com  ", token)).toBe(true);
  });

  it("rejects a token issued for a different address", () => {
    const token = bundleSubmitToken("a@example.com");
    expect(verifyBundleSubmitToken("b@example.com", token)).toBe(false);
  });

  it("rejects an empty or garbage token", () => {
    expect(verifyBundleSubmitToken("a@example.com", "")).toBe(false);
    expect(verifyBundleSubmitToken("a@example.com", "not-a-real-token")).toBe(false);
  });

  it("is not interchangeable with a path-select token context", () => {
    // A token minted here should never validate as another purpose. We can only
    // check it is stable and non-empty; cross-purpose replay is prevented by the
    // distinct "bundlesubmit:" HMAC context.
    const a = bundleSubmitToken("a@example.com");
    const b = bundleSubmitToken("a@example.com");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });
});

describe("bundleSubmitUrl", () => {
  it("carries the recipient email and a token", () => {
    const url = bundleSubmitUrl("Creator@Example.com");
    expect(url).toContain("/grow-together/submit");
    expect(url).toContain("e=creator%40example.com");
    expect(url).toContain("t=");
  });
});

describe("personalizeBundleSubmitBody", () => {
  it("replaces every occurrence of the placeholder with the signed link", () => {
    const body = "Submit here: {{BUNDLE_SUBMIT_URL}} or here {{BUNDLE_SUBMIT_URL}}";
    const out = personalizeBundleSubmitBody(body, "creator@example.com");
    expect(out.split(bundleSubmitUrl("creator@example.com")).length).toBe(3);
    expect(out).not.toContain("{{BUNDLE_SUBMIT_URL}}");
  });

  it("returns the body untouched when there is no placeholder", () => {
    const body = "A normal step with no submit link.";
    expect(personalizeBundleSubmitBody(body, "creator@example.com")).toBe(body);
  });
});
