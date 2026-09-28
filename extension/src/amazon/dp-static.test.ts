import { describe, expect, it } from "vitest";
import { detectCarouselMarkers, isBlockedHtml, readVideoCountFromHtml } from "./dp-static";

describe("detectCarouselMarkers", () => {
  it("flags the image-block hero slot as the upper carousel", () => {
    const html = `<div data-csa-c-content-id="heroquickview-thumbnail"></div>`;
    expect(detectCarouselMarkers(html)).toEqual({ upper: true, lower: false });
    const player = `<div id="detailpage-imageblock-player"></div>`;
    expect(detectCarouselMarkers(player).upper).toBe(true);
  });

  it("flags the related-videos rail as the lower carousel", () => {
    const va = `<div id="va-related-videos-widget_feature_div"></div>`;
    expect(detectCarouselMarkers(va)).toEqual({ upper: false, lower: true });
    const vse = `<div id="vse-related-videos_feature_div"></div>`;
    expect(detectCarouselMarkers(vse).lower).toBe(true);
    expect(detectCarouselMarkers(`<div class="vftphero"></div>`).lower).toBe(true);
  });

  it("reports both or neither as found", () => {
    const both = `<div id="detailpage-imageblock-player"></div><div id="vse-related-videos_feature_div"></div>`;
    expect(detectCarouselMarkers(both)).toEqual({ upper: true, lower: true });
    expect(detectCarouselMarkers(`<html><body>No videos here</body></html>`)).toEqual({
      upper: false,
      lower: false,
    });
  });
});

describe("isBlockedHtml", () => {
  it("recognizes Amazon's robot-check interstitials", () => {
    expect(isBlockedHtml("<title>Robot Check</title>")).toBe(true);
    expect(isBlockedHtml("Please validateCaptcha to continue")).toBe(true);
    expect(isBlockedHtml("To discuss automated access to Amazon data please contact")).toBe(true);
  });

  it("passes a normal product page", () => {
    expect(isBlockedHtml("<title>Cat Scratcher</title><div id='dp'>...</div>")).toBe(false);
  });
});

describe("readVideoCountFromHtml", () => {
  it("reads the data-video-count attribute", () => {
    const html = `<span id="videoCount" data-video-count="60">60 VIDEOS</span>`;
    expect(readVideoCountFromHtml(html)).toBe(60);
  });

  it("reads the element text when there is no attribute", () => {
    const html = `<span id="videoCount">18 VIDEOS</span>`;
    expect(readVideoCountFromHtml(html)).toBe(18);
  });

  it("strips thousands separators", () => {
    expect(readVideoCountFromHtml(`<span data-video-count="1,234">1,234 VIDEOS</span>`)).toBe(1234);
  });

  it("returns 0 for a rendered product page with no video markers", () => {
    const html = `<h1 id="productTitle">A product</h1><div id="add-to-cart-button"></div>`;
    expect(readVideoCountFromHtml(html)).toBe(0);
  });

  it("returns null when the page did not render as a product (retryable)", () => {
    expect(readVideoCountFromHtml(`<html><body>loading...</body></html>`)).toBeNull();
  });

  it("does not trust 0 when a video rail is present but the count is missing", () => {
    const html = `<h1 id="productTitle">A product</h1><div id="vse-related-videos_feature_div"></div>`;
    expect(readVideoCountFromHtml(html)).toBeNull();
  });
});
