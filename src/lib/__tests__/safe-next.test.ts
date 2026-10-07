/**
 * Summary: resolveNext must only ever return allow-listed same-site paths.
 * Dependencies: vitest, @/lib/safe-next.
 */
import { describe, it, expect } from "vitest";
import { resolveNext } from "@/lib/safe-next";

const FALLBACK = "/dashboard";

describe("resolveNext", () => {
  it("passes allow-listed paths through", () => {
    expect(resolveNext("/dashboard")).toBe("/dashboard");
    expect(resolveNext("/dashboard/extension")).toBe("/dashboard/extension");
    expect(resolveNext("/dashboard/affiliates?tab=links#top")).toBe("/dashboard/affiliates?tab=links#top");
    expect(resolveNext("/affiliates/portal/x")).toBe("/affiliates/portal/x");
    expect(resolveNext("/help/community/abc-123")).toBe("/help/community/abc-123");
  });

  it("defaults when missing", () => {
    expect(resolveNext(null)).toBe(FALLBACK);
    expect(resolveNext(undefined)).toBe(FALLBACK);
    expect(resolveNext("")).toBe(FALLBACK);
  });

  it.each([
    "https://evil.com",
    "http://evil.com/dashboard",
    "//evil.com",
    "//evil.com/dashboard",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "/\evil.com",
    "/\/evil.com",
    "\\evil.com",
    "/dashboard\..\evil",
    "/\t/evil.com",
    "/\n/evil.com",
    "/dashboard\r\nSet-Cookie: x=1",
    "/dashboard@evil.com",
    "/dashboardevil",
    "/login",
    "/api/admin/users/delete",
    "dashboard",
    " /dashboard",
    "/%2F%2Fevil.com",
  ])("rejects %j", (bad) => {
    expect(resolveNext(bad)).toBe(FALLBACK);
  });

  it("honours a custom fallback", () => {
    expect(resolveNext("https://evil.com", "/login")).toBe("/login");
  });

  it("rejects absurdly long values", () => {
    expect(resolveNext("/dashboard/" + "a".repeat(5000))).toBe(FALLBACK);
  });
});
