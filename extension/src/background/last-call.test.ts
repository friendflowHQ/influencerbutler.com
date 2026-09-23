import { describe, expect, it } from "vitest";
import { pollGridUrls } from "./last-call";
import {
  CAMPAIGN_DETAIL_URL,
  CAMPAIGN_GRID_URL,
  associatesCredentialsUrl,
  ASSOCIATES_CREDENTIALS_URL,
  campaignGridUrl,
} from "../shared/constants";

const US_GRID =
  "https://affiliate-program.amazon.com/p/connect/requests?status=opportunity&type=affiliate-plus&sortBy=recommended_for_you&campaignStatuses=active%2Cpending&nonFullyClaimedOnly=false";

describe("Creator Connections URLs", () => {
  it("keeps the US grid URL byte-identical", () => {
    expect(CAMPAIGN_GRID_URL).toBe(US_GRID);
    expect(campaignGridUrl()).toBe(US_GRID);
    expect(campaignGridUrl("amazon.com")).toBe(US_GRID);
  });

  it("opens the grid and detail page on the marketplace's own host", () => {
    expect(campaignGridUrl("amazon.co.uk")).toBe(
      US_GRID.replace("affiliate-program.amazon.com", "affiliate-program.amazon.co.uk"),
    );
    expect(campaignGridUrl("amazon.ca")).toContain("https://affiliate-program.amazon.ca/p/connect/");
    // A marketplace the manifest does not grant falls back to the US host.
    expect(campaignGridUrl("amazon.de")).toBe(US_GRID);
    const id = "amzn1.campaign.ABC";
    expect(CAMPAIGN_DETAIL_URL(id)).toBe(
      "https://affiliate-program.amazon.com/p/connect/request?adId=amzn1.campaign.ABC&campaignId=amzn1.campaign.ABC&type=affiliate-plus",
    );
    expect(CAMPAIGN_DETAIL_URL(id, "amazon.co.uk")).toMatch(
      /^https:\/\/affiliate-program\.amazon\.co\.uk\/p\/connect\/request\?adId=/,
    );
  });

  it("points the Associates credentials link at the marketplace's Associates Central", () => {
    expect(associatesCredentialsUrl()).toBe(ASSOCIATES_CREDENTIALS_URL);
    expect(associatesCredentialsUrl("amazon.com")).toBe(ASSOCIATES_CREDENTIALS_URL);
    expect(associatesCredentialsUrl("amazon.co.uk")).toBe(
      "https://affiliate-program.amazon.co.uk/assoc_credentials/home",
    );
  });
});

describe("pollGridUrls", () => {
  it("opens just the US grid for a US-only (or legacy) watchlist", () => {
    expect(pollGridUrls([{}, { marketplace: "amazon.com" }])).toEqual([US_GRID]);
  });

  it("opens one grid per Creator Connections host", () => {
    const urls = pollGridUrls([
      { marketplace: "amazon.co.uk" },
      {},
      { marketplace: "amazon.co.uk" },
      { marketplace: "amazon.de" },
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("affiliate-program.amazon.co.uk");
    expect(urls[1]).toBe(US_GRID);
  });

  it("returns nothing for an empty watchlist", () => {
    expect(pollGridUrls([])).toEqual([]);
  });
});
