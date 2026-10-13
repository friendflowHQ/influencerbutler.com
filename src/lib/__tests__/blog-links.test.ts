import { describe, expect, it } from "vitest";
import { LINK_TARGETS, linkedPaths, pickResources } from "../blog-links";
import { authorJsonLd, findBlogAuthor, resolveModifiedDate } from "../blog-authors";

describe("link targets file", () => {
  it("has unique hrefs, valid kinds and compilable regexes", () => {
    const hrefs = LINK_TARGETS.map((t) => t.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const t of LINK_TARGETS) {
      expect(["feature", "tool", "guide", "course", "extension"]).toContain(t.kind);
      expect(t.href.startsWith("/")).toBe(true);
      for (const r of [...t.match, ...t.inline]) expect(() => new RegExp(r)).not.toThrow();
    }
  });

  it("never names a competitor (public pages follow the competitor naming policy)", () => {
    const text = JSON.stringify(LINK_TARGETS).toLowerCase();
    for (const name of ["oink", "viral vue", "viralvue", "logie", "fluencer fruit", "campaign finder"]) {
      expect(text).not.toContain(name);
    }
  });

  it("uses no em dashes", () => {
    expect(JSON.stringify(LINK_TARGETS)).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("pickResources", () => {
  it("surfaces the tool a post is about, ahead of unrelated features", () => {
    const out = pickResources({
      title: "How to read Best Sellers Rank",
      keywords: "BSR, best sellers rank",
      body: "BSR tells you how a product sells. Best Sellers Rank changes hourly.",
    });
    expect(out[0].href).toBe("/tools/amazon-sales-estimator");
  });

  it("leaves out pages the post already links to", () => {
    const out = pickResources({
      title: "Deals Butler guide",
      body: "Deals Butler posts deals. See [Deals Butler](/features/deals-butler).",
    });
    expect(out.map((r) => r.href)).not.toContain("/features/deals-butler");
  });

  it("includes a non-feature resource when the post is feature-heavy but a tool is relevant", () => {
    const out = pickResources(
      {
        title: "Deals Butler and Pricecrash Butler and Storefront Butler",
        summary: "Deals Butler, Pricecrash Butler, Storefront Butler, Daily Commission Butler",
        body: "Deals Butler. Pricecrash Butler. Storefront Butler. Daily Commission Butler. Check the BSR. BSR moves daily.",
      },
      { max: 4 },
    );
    expect(out.some((r) => r.kind !== "feature")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it("ignores a single stray mention of a topic", () => {
    const out = pickResources({ title: "Weekly routine", body: "We once mentioned Pinterest in passing." });
    expect(out.map((r) => r.href)).not.toContain("/features/pinterest-butler");
  });

  it("falls back to evergreen links so no post ends with an empty block", () => {
    const out = pickResources({ title: "Totally unrelated musings", body: "Nothing to match here." });
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.map((r) => r.href)).toContain("/course/amazon-influencer");
  });

  it("returns unique links and respects max", () => {
    const out = pickResources(
      { title: "Prime Day deals pricecrash storefront benable pinterest", body: "prime day deals" },
      { max: 3 },
    );
    expect(out.length).toBeLessThanOrEqual(3);
    expect(new Set(out.map((r) => r.href)).size).toBe(out.length);
  });
});

describe("linkedPaths", () => {
  it("normalizes own-domain absolute links, trailing slashes and queries", () => {
    const set = linkedPaths("[a](/x/?q=1) [b](https://www.influencerbutler.com/y) [c](https://example.com/z)");
    expect(set.has("/x")).toBe(true);
    expect(set.has("/y")).toBe(true);
    expect(set.has("/z")).toBe(false);
  });
});

describe("authors and modified dates", () => {
  it("resolves registered people and leaves everyone else as an Organization", () => {
    expect(findBlogAuthor("liz dean")?.name).toBe("Liz Dean");
    expect(findBlogAuthor("The Influencer Butler Team")).toBeNull();
    expect(authorJsonLd("The Influencer Butler Team")["@type"]).toBe("Organization");
    const person = authorJsonLd("Liz Dean");
    expect(person["@type"]).toBe("Person");
    expect(person.url).toBe("https://www.influencerbutler.com/about");
  });

  it("only reports a later dateModified when `updated` is a valid, not-earlier date", () => {
    expect(resolveModifiedDate("2026-07-01", undefined)).toBe("2026-07-01");
    expect(resolveModifiedDate("2026-07-01", "2026-10-09")).toBe("2026-10-09");
    expect(resolveModifiedDate("2026-07-01", "2026-06-01")).toBe("2026-07-01");
    expect(resolveModifiedDate("2026-07-01", "last tuesday")).toBe("2026-07-01");
  });
});
