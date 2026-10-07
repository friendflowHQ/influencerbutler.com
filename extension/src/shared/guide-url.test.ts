import { describe, expect, it } from "vitest";
import { API_BASE, HOW_IT_WORKS_GUIDE_URLS, guideUrlFor } from "./constants";

describe("guideUrlFor", () => {
  it("returns the guide in the user's language", () => {
    expect(guideUrlFor("en")).toBe(HOW_IT_WORKS_GUIDE_URLS.en);
    expect(guideUrlFor("es")).toBe(HOW_IT_WORKS_GUIDE_URLS.es);
    expect(guideUrlFor("fr")).toBe(HOW_IT_WORKS_GUIDE_URLS.fr);
  });

  it("falls back to English for anything unknown", () => {
    expect(guideUrlFor("de")).toBe(HOW_IT_WORKS_GUIDE_URLS.en);
    expect(guideUrlFor("")).toBe(HOW_IT_WORKS_GUIDE_URLS.en);
  });

  it("points at the public /guides path on the main site (same origin for OPEN_URL, not behind /help)", () => {
    for (const url of Object.values(HOW_IT_WORKS_GUIDE_URLS)) {
      expect(url.startsWith(`${API_BASE}/guides/`)).toBe(true);
      expect(url.endsWith(".pdf")).toBe(true);
      expect(url).not.toContain("/help/");
    }
  });
});
