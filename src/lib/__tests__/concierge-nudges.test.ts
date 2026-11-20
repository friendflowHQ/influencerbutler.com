import { describe, it, expect } from "vitest";
import { nudgeForPath } from "../concierge-nudges";

describe("nudgeForPath", () => {
  it("matches the dashboard home only exactly", () => {
    expect(nudgeForPath("/dashboard")?.id).toBe("home-setup");
    expect(nudgeForPath("/dashboard/")?.id).toBe("home-setup");
    expect(nudgeForPath("/dashboard/book")).toBeNull();
  });

  it("matches section prefixes", () => {
    expect(nudgeForPath("/dashboard/extension/setup")?.id).toBe("extension");
    expect(nudgeForPath("/dashboard/billing")?.id).toBe("plan");
    expect(nudgeForPath("/dashboard/subscription")?.id).toBe("plan");
  });

  it("returns null for empty or unknown paths", () => {
    expect(nudgeForPath(null)).toBeNull();
    expect(nudgeForPath("/pricing")).toBeNull();
  });

  it("never uses an em dash", () => {
    for (const p of ["/dashboard", "/dashboard/extension", "/dashboard/api-keys", "/dashboard/earnings", "/dashboard/billing", "/dashboard/events"]) {
      const n = nudgeForPath(p)!;
      expect(n.text + n.question).not.toContain(String.fromCharCode(0x2014));
    }
  });
});
