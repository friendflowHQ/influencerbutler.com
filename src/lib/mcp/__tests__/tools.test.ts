/**
 * Summary: create_affiliate_link is rate limited per user (it mutates state
 *   and burns Lemon Squeezy API calls per attempt).
 * Dependencies: vitest, ../tools, @/lib/admin, @/lib/affiliate-code-generator,
 *   @/lib/affiliates, @/lib/rate-limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin", () => ({ createAdminClient: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/affiliate-code-generator", () => ({
  generateAndCreateAffiliateCode: vi.fn().mockResolvedValue({ code: "ABC10", discountId: "d1" }),
}));
vi.mock("@/lib/affiliates", () => ({
  fetchLsAffiliate: vi.fn(),
  buildShareLink: vi.fn(),
}));

import { callTool } from "../tools";
import { __resetRateLimitMemory } from "@/lib/rate-limit";
import type { Principal } from "../auth";

const principal: Principal = { userId: "u1", email: "me@example.com", source: "api-key" };

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitMemory();
  process.env.LEMONSQUEEZY_STORE_ID = "store_1";
});

describe("create_affiliate_link rate limiting", () => {
  it("allows up to 5 calls per hour then rejects the 6th", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await callTool("create_affiliate_link", { firstName: "Pat" }, principal);
      expect(res.isError).not.toBe(true);
    }
    const sixth = await callTool("create_affiliate_link", { firstName: "Pat" }, principal);
    expect(sixth.isError).toBe(true);
    expect(sixth.content[0].text).toMatch(/rate limited/i);
  });

  it("does not let one user's limit affect another user", async () => {
    for (let i = 0; i < 5; i++) {
      await callTool("create_affiliate_link", { firstName: "Pat" }, principal);
    }
    const otherUser: Principal = { userId: "u2", email: null, source: "api-key" };
    const res = await callTool("create_affiliate_link", { firstName: "Pat" }, otherUser);
    expect(res.isError).not.toBe(true);
  });
});
