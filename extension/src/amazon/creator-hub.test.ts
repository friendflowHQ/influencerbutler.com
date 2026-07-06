import { describe, expect, it } from "vitest";
import { parseUploadState } from "./creator-hub";

describe("parseUploadState", () => {
  const json = JSON.stringify({
    video: {
      contentId: "0f404474460a43df9bda886bf88f1959",
      title: "Effortless Lawn Care #ad",
      homeMarketPlaceId: "ATVPDKIKX0DER",
      status: { state: "APPROVED" },
      associatedAsins: { originalValue: ["B0016HF5GK", "b083qqzgbt", "BADASIN"] },
    },
  });

  it("pulls title, asins (uppercased, filtered), and the marketplace code", () => {
    const s = parseUploadState(json)!;
    expect(s.title).toBe("Effortless Lawn Care #ad");
    expect(s.contentId).toBe("0f404474460a43df9bda886bf88f1959");
    expect(s.asins).toEqual(["B0016HF5GK", "B083QQZGBT"]); // BADASIN dropped, lowercase upcased
    expect(s.marketplaceId).toBe("ATVPDKIKX0DER");
    expect(s.marketplaceCode).toBe("US");
    expect(s.statusState).toBe("APPROVED");
  });

  it("returns null for malformed or non-video JSON", () => {
    expect(parseUploadState("not json")).toBeNull();
    expect(parseUploadState("{}")).toBeNull();
    expect(parseUploadState(JSON.stringify({ video: null }))).toBeNull();
  });

  it("tolerates a missing asin list and unknown marketplace", () => {
    const s = parseUploadState(JSON.stringify({ video: { title: "x", homeMarketPlaceId: "ZZZ" } }))!;
    expect(s.asins).toEqual([]);
    expect(s.marketplaceCode).toBeNull();
  });
});
