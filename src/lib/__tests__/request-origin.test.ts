/**
 * Summary: Unit tests for the same-origin / cross-site request guard.
 * Dependencies: vitest, ../request-origin.
 */

import { describe, it, expect } from "vitest";
import { isSameOrigin, crossSiteBlocked } from "../request-origin";

function req(headers: Record<string, string>): Request {
  return new Request("https://www.influencerbutler.com/api/x", { method: "POST", headers });
}

describe("isSameOrigin", () => {
  it("allows Sec-Fetch-Site: same-origin", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("blocks Sec-Fetch-Site: cross-site", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("allows a matching Origin host", () => {
    expect(
      isSameOrigin(
        req({ origin: "https://www.influencerbutler.com", host: "www.influencerbutler.com" }),
      ),
    ).toBe(true);
  });

  it("blocks a foreign Origin host", () => {
    expect(
      isSameOrigin(req({ origin: "https://evil.example.com", host: "www.influencerbutler.com" })),
    ).toBe(false);
  });

  it("allows when neither header is present (server-to-server / same-origin GET)", () => {
    expect(isSameOrigin(req({}))).toBe(true);
  });

  it("prefers Sec-Fetch-Site over Origin when both are present", () => {
    // A browser same-origin POST sends both; sec-fetch-site is authoritative.
    expect(
      isSameOrigin(
        req({
          "sec-fetch-site": "same-origin",
          origin: "https://www.influencerbutler.com",
          host: "www.influencerbutler.com",
        }),
      ),
    ).toBe(true);
  });
});

describe("crossSiteBlocked", () => {
  it("returns null for same-origin", () => {
    expect(crossSiteBlocked(req({ "sec-fetch-site": "same-origin" }))).toBeNull();
  });

  it("returns a 403 Response for cross-site", () => {
    const res = crossSiteBlocked(req({ "sec-fetch-site": "cross-site" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});
