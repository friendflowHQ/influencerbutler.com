import { describe, expect, it } from "vitest";
import { applyInlineLinks, existingHrefs, isProseLine } from "../../../scripts/lib/blog-inline-links.mjs";

type Target = {
  href: string;
  kind: string;
  match: string[];
  inline: string[];
  avoidCategories?: string[];
  avoidLine?: string;
};

const deals: Target = {
  href: "/features/deals-butler",
  kind: "feature",
  match: ["deals butler", "deal posts?"],
  inline: ["Deals Butler"],
};
const tool: Target = {
  href: "/tools/amazon-sales-estimator",
  kind: "tool",
  match: ["best sellers? rank", "\\bBSR\\b"],
  inline: ["Best Sellers? Rank", "\\bBSR\\b"],
};
const like: Target = {
  href: "/features/like-butler",
  kind: "feature",
  match: ["like butler"],
  inline: ["(?<!Instagram )Like Butler"],
  avoidCategories: ["instagram"],
  avoidLine: "instagram",
};

describe("applyInlineLinks", () => {
  it("links the first natural mention only", () => {
    const body = "Intro.\n\nDeals Butler finds deals. Deals Butler posts them.\n";
    const out = applyInlineLinks(body, [deals]);
    expect(out.body).toContain("[Deals Butler](/features/deals-butler) finds deals. Deals Butler posts them.");
    expect(out.added).toEqual([{ href: "/features/deals-butler", text: "Deals Butler" }]);
  });

  it("never links inside headings, quotes, code, tables, existing links or URLs", () => {
    const body = [
      "## Deals Butler in a heading",
      "> Deals Butler in a quote",
      "```",
      "Deals Butler in code",
      "```",
      "| Deals Butler | table |",
      "[Deals Butler](/somewhere) already linked",
      "`Deals Butler` inline code",
      "https://example.com/Deals Butler url",
    ].join("\n");
    const out = applyInlineLinks(body, [deals]);
    expect(out.added).toHaveLength(0);
    expect(out.body).toBe(body);
  });

  it("is idempotent: a target the post already links to is skipped", () => {
    const body = "Deals Butler is great.\n";
    const first = applyInlineLinks(body, [deals]);
    const second = applyInlineLinks(first.body, [deals]);
    expect(second.added).toHaveLength(0);
    expect(second.body).toBe(first.body);
  });

  it("counts links to target pages already in the post against the cap", () => {
    const a: Target = { ...deals, href: "/features/a", inline: ["Alpha"], match: ["Alpha"] };
    const b: Target = { ...deals, href: "/features/b", inline: ["Beta"], match: ["Beta"] };
    const out = applyInlineLinks("[x](/features/a) then Beta here.\n", [a, b], { maxLinks: 1 });
    expect(out.added).toHaveLength(0);
    const room = applyInlineLinks("[x](/features/a) then Beta here.\n", [a, b], { maxLinks: 2 });
    expect(room.added).toHaveLength(1);
  });

  it("treats an absolute own-domain link as already linked", () => {
    const body = "See [deals](https://www.influencerbutler.com/features/deals-butler/). Deals Butler too.\n";
    expect(applyInlineLinks(body, [deals]).added).toHaveLength(0);
  });

  it("is case-sensitive for product names", () => {
    expect(applyInlineLinks("a deals butler mention\n", [deals]).added).toHaveLength(0);
  });

  it("caps new links per post and prefers the more discussed topic", () => {
    const body = [
      "BSR is mentioned once.",
      "Deals Butler and deal posts and deal posts and Deals Butler again.",
    ].join("\n\n");
    const out = applyInlineLinks(body, [tool, deals], { maxLinks: 1 });
    expect(out.added.map((a: { href: string }) => a.href)).toEqual(["/features/deals-butler"]);
  });

  it("enforces per-kind caps", () => {
    const a: Target = { ...deals, href: "/features/a", inline: ["Alpha"], match: ["Alpha"] };
    const b: Target = { ...deals, href: "/features/b", inline: ["Beta"], match: ["Beta"] };
    const c: Target = { ...deals, href: "/features/c", inline: ["Gamma"], match: ["Gamma"] };
    const out = applyInlineLinks("Alpha Beta Gamma\n", [a, b, c], { maxLinks: 5 });
    expect(out.added).toHaveLength(2);
  });

  it("skips targets whose wording the post contradicts (category and line guards)", () => {
    expect(applyInlineLinks("Like Butler keeps you engaged.\n", [like], { category: "Instagram" }).added).toHaveLength(0);
    const line = applyInlineLinks("Like Butler on Instagram.\n\nLike Butler for storefronts.\n", [like], {
      category: "Amazon",
    });
    expect(line.body).toContain("[Like Butler](/features/like-butler) for storefronts.");
    expect(line.body).toContain("Like Butler on Instagram.");
  });

  it("does not link a longer product name that merely contains the phrase", () => {
    expect(applyInlineLinks("Try Instagram Like Butler today.\n", [like], { category: "Amazon" }).added).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("isProseLine rejects structural lines", () => {
    expect(isProseLine("Plain sentence.")).toBe(true);
    expect(isProseLine("- list item")).toBe(true);
    expect(isProseLine("# Heading")).toBe(false);
    expect(isProseLine("> quote")).toBe(false);
    expect(isProseLine("![img](/assets/x.png)")).toBe(false);
    expect(isProseLine("")).toBe(false);
  });

  it("existingHrefs normalizes absolute own-domain links and strips query strings", () => {
    const hrefs = existingHrefs("[a](/x?y=1) [b](https://www.influencerbutler.com/z/) [c](https://other.com/q)");
    expect(hrefs.has("/x")).toBe(true);
    expect(hrefs.has("/z")).toBe(true);
    expect(hrefs.has("/q")).toBe(false);
  });
});
