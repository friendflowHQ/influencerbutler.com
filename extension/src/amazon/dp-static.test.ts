import { describe, expect, it } from "vitest";
import { detectCarouselMarkers, isBlockedHtml } from "./dp-static";

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
