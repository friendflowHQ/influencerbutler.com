/**
 * Summary: CSRF guard for cookie-authenticated mutating routes. Same-site
 *   (links.influencerbutler.com) must be rejected; same-origin must pass.
 * Dependencies: vitest, ../csrf-guard.
 */
import { describe, it, expect } from "vitest";
import { csrfViolation, csrfForApiRequest, withCsrfGuard, isAdminLikePath } from "../csrf-guard";

const COOKIE = "sb-abc123-auth-token=eyJ.fake.jwt";

function req(
  path: string,
  headers: Record<string, string> = {},
  init: { method?: string; body?: string } = {},
): Request {
  return new Request(`https://www.influencerbutler.com${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body,
  });
}

const sameOrigin = { "sec-fetch-site": "same-origin", cookie: COOKIE };

describe("csrfViolation", () => {
  it("passes safe methods untouched", () => {
    expect(csrfViolation(req("/api/admin/x", { cookie: COOKIE }, { method: "GET" }), { always: true })).toBeNull();
  });

  it("blocks same-site (hosted page on links.*) even with a valid cookie", () => {
    const r = req("/api/admin/staff/invite", {
      cookie: COOKIE,
      "sec-fetch-site": "same-site",
      origin: "https://links.influencerbutler.com",
      "content-type": "application/json",
    }, { body: "{}" });
    expect(csrfViolation(r, { always: true })?.status).toBe(403);
  });

  it("blocks cross-site", () => {
    const r = req("/api/admin/users/delete", { cookie: COOKIE, "sec-fetch-site": "cross-site", origin: "https://evil.com" });
    expect(csrfViolation(r, { always: true })?.status).toBe(403);
  });

  it("blocks when no fetch metadata, Origin or Referer is present on a cookie request", () => {
    expect(csrfViolation(req("/api/admin/x", { cookie: COOKIE }), { always: true })?.status).toBe(403);
  });

  it("blocks an Origin that merely contains our host", () => {
    const r = req("/api/admin/x", { cookie: COOKIE, origin: "https://www.influencerbutler.com.evil.com" });
    expect(csrfViolation(r, { always: true })?.status).toBe(403);
  });

  it("allows same-origin JSON", () => {
    const r = req("/api/admin/x", { ...sameOrigin, "content-type": "application/json", "content-length": "2" }, { body: "{}" });
    expect(csrfViolation(r, { always: true })).toBeNull();
  });

  it("allows a matching Origin when Sec-Fetch-Site is absent", () => {
    const r = req("/api/admin/x", { cookie: COOKIE, origin: "https://www.influencerbutler.com", "content-type": "application/json" }, { body: "{}" });
    expect(csrfViolation(r, { always: true })).toBeNull();
  });

  it("falls back to Referer when Origin is absent", () => {
    const r = req("/api/admin/x", { cookie: COOKIE, referer: "https://www.influencerbutler.com/dashboard/admin" });
    expect(csrfViolation(r, { always: true })).toBeNull();
  });

  it("rejects non-JSON bodies even from the right origin (simple-form content types)", () => {
    for (const ct of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const r = req("/api/admin/x", { ...sameOrigin, "content-type": ct }, { body: "a=b" });
      expect(csrfViolation(r, { always: true })?.status).toBe(415);
    }
  });

  it("lets an empty-body POST through without a content type", () => {
    expect(csrfViolation(req("/api/admin/x", sameOrigin), { always: true })).toBeNull();
  });

  it("exempts Bearer-authenticated callers (desktop app, cron, webhooks)", () => {
    const r = req("/api/admin/community/respond", { authorization: "Bearer secret", "sec-fetch-site": "cross-site" });
    expect(csrfViolation(r, { always: true })).toBeNull();
  });

  it("does not guard cookie-less requests unless always is set", () => {
    const r = req("/api/newsletter/subscribe", { "sec-fetch-site": "cross-site" });
    expect(csrfViolation(r)).toBeNull();
    expect(csrfViolation(r, { always: true })?.status).toBe(403);
  });
});

describe("csrfForApiRequest (middleware policy)", () => {
  it("guards admin-like paths unconditionally", () => {
    expect(isAdminLikePath("/api/admin/staff/invite")).toBe(true);
    expect(isAdminLikePath("/api/affiliates/admin-disburse")).toBe(true);
    expect(isAdminLikePath("/api/affiliates/approve")).toBe(true);
    expect(isAdminLikePath("/api/affiliates/me-selfhosted")).toBe(false);
    const r = req("/api/admin/licenses/revoke", { "sec-fetch-site": "cross-site" });
    expect(csrfForApiRequest(r, "/api/admin/licenses/revoke")?.status).toBe(403);
  });

  it("guards other mutating routes when a session cookie rides along", () => {
    const evil = req("/api/subscription/cancel", { cookie: COOKIE, "sec-fetch-site": "same-site", origin: "https://links.influencerbutler.com" });
    expect(csrfForApiRequest(evil, "/api/subscription/cancel")?.status).toBe(403);
    const fine = req("/api/subscription/cancel", { ...sameOrigin, "content-type": "application/json" });
    expect(csrfForApiRequest(fine, "/api/subscription/cancel")).toBeNull();
  });

  it("ignores GETs", () => {
    const r = req("/api/admin/x", { "sec-fetch-site": "cross-site" }, { method: "GET" });
    expect(csrfForApiRequest(r, "/api/admin/x")).toBeNull();
  });
});

describe("withCsrfGuard", () => {
  it("wraps a handler", async () => {
    const handler = withCsrfGuard(async () => new Response("ok"));
    const bad = await handler(req("/api/x", { cookie: COOKIE, "sec-fetch-site": "same-site", origin: "https://links.influencerbutler.com" }));
    expect(bad.status).toBe(403);
    const good = await handler(req("/api/x", sameOrigin));
    expect(await good.text()).toBe("ok");
  });
});
