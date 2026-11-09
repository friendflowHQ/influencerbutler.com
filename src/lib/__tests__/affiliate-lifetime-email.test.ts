import { describe, expect, it } from "vitest";
import { buildLifetimeTermsEmail } from "@/lib/affiliate-lifetime-email";

describe("buildLifetimeTermsEmail", () => {
  it("greets by first name, states the rate, code and link, signs as Liz", () => {
    const { subject, text } = buildLifetimeTermsEmail({
      name: "Tanner Clemens",
      ratePercent: 30,
      affiliateCode: "TANNER",
    });
    expect(subject).toBe("You now earn for life on every referral");
    expect(text.startsWith("Hi Tanner,")).toBe(true);
    expect(text).toContain("you earn 30% for life");
    expect(text).toContain("Keep sharing your code TANNER");
    expect(text).toContain("/?code=TANNER");
    expect(text.trim().endsWith("Liz\nInfluencer Butler")).toBe(true);
  });

  it("falls back gracefully without a name or code", () => {
    const { text } = buildLifetimeTermsEmail({ name: null, ratePercent: 40, affiliateCode: null });
    expect(text.startsWith("Hi there,")).toBe(true);
    expect(text).toContain("40% for life");
    expect(text).not.toContain("?code=");
  });
});
