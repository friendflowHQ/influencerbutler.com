import { describe, expect, it } from "vitest";
import { tourKeyForPage } from "./index";

describe("tourKeyForPage", () => {
  it("maps page types to tours", () => {
    expect(tourKeyForPage("product")).toBe("product");
    expect(tourKeyForPage("search")).toBe("search");
    expect(tourKeyForPage("deals")).toBe("search");
    expect(tourKeyForPage("campaign-grid")).toBe("campaign");
    expect(tourKeyForPage("storefront")).toBe("storefront");
  });
  it("has no tour for other pages", () => {
    expect(tourKeyForPage("other")).toBeNull();
    expect(tourKeyForPage("order-history")).toBeNull();
  });
});
