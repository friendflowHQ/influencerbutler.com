import { describe, it, expect } from "vitest";
import { estMonthlySalesFromReviews } from "@/lib/market-estimate";

describe("estMonthlySalesFromReviews", () => {
  it("uses review velocity over a real span (medium confidence)", () => {
    // +60 reviews over 30 days = 60/month; at a 2% review rate that scales to
    // ~3000 monthly sales.
    const { est, confidence } = estMonthlySalesFromReviews(100, 160, 30);
    expect(confidence).toBe("medium");
    expect(est).toBe(3000);
  });

  it("scales the growth to a 30-day month when the span is not 30 days", () => {
    // +30 reviews over 15 days = 60/month -> same 3000 as above.
    expect(estMonthlySalesFromReviews(100, 130, 15).est).toBe(3000);
  });

  it("falls back to the absolute count when there is only one observation", () => {
    const { est, confidence } = estMonthlySalesFromReviews(null, 480, null);
    expect(confidence).toBe("low");
    // 480 / 0.02 lifetime, spread over ~24 months.
    expect(est).toBe(1000);
  });

  it("falls back to low confidence when reviews are flat or shrinking", () => {
    const flat = estMonthlySalesFromReviews(200, 200, 30);
    expect(flat.confidence).toBe("low");
    expect(flat.est).toBeGreaterThan(0);
  });

  it("returns null when there is no review signal at all", () => {
    expect(estMonthlySalesFromReviews(null, null, null)).toEqual({ est: null, confidence: "low" });
  });
});
