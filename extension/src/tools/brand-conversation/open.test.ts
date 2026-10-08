import { describe, expect, it } from "vitest";
import { buildDesktopDeepLink, buildDesktopOpenUrl, creatorConnectionsUrl, onCreatorConnectionsPage } from "./open";

describe("buildDesktopOpenUrl", () => {
  it("routes through the site's bounce page to the messenger deep link", () => {
    const url = new URL(buildDesktopOpenUrl("Litter-Robot"));
    expect(url.origin).toBe("https://www.influencerbutler.com");
    expect(url.pathname).toBe("/app/open");
    expect(url.searchParams.get("to")).toBe("influencerbutler://messenger?brand=Litter-Robot");
  });

  it("survives a brand with spaces and symbols", () => {
    const to = new URL(buildDesktopOpenUrl("Ben & Jerry's")).searchParams.get("to") ?? "";
    expect(to.startsWith("influencerbutler://messenger?brand=")).toBe(true);
    const inner = new URL(to);
    expect(inner.hostname).toBe("messenger");
    expect(inner.searchParams.get("brand")).toBe("Ben & Jerry's");
  });

  it("keeps the deep link inside the bounce page's 512 character limit", () => {
    const long = "Ünï ".repeat(200);
    const link = buildDesktopDeepLink(long);
    expect(link.length).toBeLessThanOrEqual(512);
    expect(link.startsWith("influencerbutler://messenger?brand=")).toBe(true);
  });
});

describe("creator connections", () => {
  it("opens the campaigns list carrying the brand", () => {
    expect(creatorConnectionsUrl("Hair Max")).toBe(
      "https://affiliate-program.amazon.com/p/connect/requests#ib-open-thread=Hair%20Max",
    );
  });

  it("recognises the CC hosts", () => {
    expect(onCreatorConnectionsPage("affiliate-program.amazon.com")).toBe(true);
    expect(onCreatorConnectionsPage("affiliate-program.amazon.co.uk")).toBe(true);
    expect(onCreatorConnectionsPage("www.amazon.com")).toBe(false);
  });
});
