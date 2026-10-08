/**
 * Summary: Unit tests for buildCampaignEmail, covering the unchanged plain-text
 * path and the opt-in formatted HTML path (bold, headings, bullets, links, CTA
 * button, escaping, plain-text alternative).
 * Dependencies: vitest, ../campaign-email.
 */

import { describe, it, expect } from "vitest";
import {
  buildCampaignEmail,
  campaignPlainText,
  extractSrcTags,
  hasCampaignMarkup,
  renderCampaignHtml,
} from "../campaign-email";

const URL = "https://www.influencerbutler.com/go/download?src=test";

describe("hasCampaignMarkup", () => {
  it("is false for a plain body, even with a bare URL on its own line", () => {
    expect(hasCampaignMarkup(`Hi there,\n\nTry it:\n${URL}\n\nThe team`)).toBe(false);
  });

  it("is false when a single '- ' sign-off is the only dash line", () => {
    expect(hasCampaignMarkup("Hi there,\n\nBody.\n\n- The Influencer Butler team")).toBe(false);
  });

  it("is true for bold, a heading line, or a bullet line", () => {
    expect(hasCampaignMarkup("This is **important**.")).toBe(true);
    expect(hasCampaignMarkup("Intro\n\n# Big news")).toBe(true);
    expect(hasCampaignMarkup("Intro\n\n- one\n- two")).toBe(true);
  });
});

describe("buildCampaignEmail", () => {
  it("leaves a plain campaign as text only (unchanged behavior)", () => {
    const built = buildCampaignEmail({ body: "Hello\n\nPlain body" });
    expect(built).toEqual({ text: "Hello\n\nPlain body" });
  });

  it("emits HTML for a marked-up campaign and a clean text part", () => {
    const body = `Hi there,\n\n**Big news** today.\n\n[Try Pro free](${URL})`;
    const built = buildCampaignEmail({ body });
    expect(built.html).toContain("<strong>Big news</strong>");
    expect(built.text).not.toContain("**");
    expect(built.text).toContain(`Try Pro free: ${URL}`);
    expect(built.attachments).toBeUndefined();
  });

  it("keeps inline images alongside formatted HTML", () => {
    const built = buildCampaignEmail({
      body: "**Hi**",
      inlineImages: [{ filename: "a.png", content: "AAAA", contentType: "image/png" }],
    });
    expect(built.html).toContain("<strong>Hi</strong>");
    expect(built.html).toContain("cid:inline-0@influencerbutler");
    expect(built.attachments).toHaveLength(1);
  });
});

describe("renderCampaignHtml", () => {
  it("escapes HTML in the body", () => {
    const html = renderCampaignHtml("**Tom & Jerry** <script>alert(1)</script>");
    expect(html).toContain("Tom &amp; Jerry");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("turns a standalone [label](url) line into a CTA button", () => {
    const html = renderCampaignHtml(`**Hi**\n\n[Try Pro free](${URL})`);
    expect(html).toContain(`<a href="${URL}"`);
    expect(html).toContain("display:inline-block");
    expect(html).toContain("background:#c2410c");
    expect(html).toContain(">Try Pro free</a>");
  });

  it("links inline markdown links and bare URLs, leaving the trailing period outside", () => {
    const html = renderCampaignHtml(`See [the docs](${URL}) or ${URL}.`);
    expect(html).toContain(`>the docs</a>`);
    expect(html).toContain(`>${URL}</a>.`);
  });

  it("renders headings, bullet lists and line breaks", () => {
    const html = renderCampaignHtml("# Title\n\n- one\n- two\n\nline a\nline b");
    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain("line a<br>line b");
  });

  it("keeps a single '- ' sign-off as a paragraph, not a bullet", () => {
    const html = renderCampaignHtml("**Hi**\n\n- The Influencer Butler team");
    expect(html).not.toContain("<ul");
    expect(html).toContain("- The Influencer Butler team");
  });

  it("does not turn a non-http link into an anchor", () => {
    const html = renderCampaignHtml("**x** [bad](javascript:alert(1))");
    expect(html).not.toContain("<a href");
  });
});

describe("extractSrcTags", () => {
  it("finds unique src tags from bare and markdown links, in order", () => {
    const body = [
      "Try https://www.influencerbutler.com/go/download?src=group-mirror-a today.",
      "[Button](https://www.influencerbutler.com/go/download?utm=x&src=group-mirror-b)",
      "Again https://www.influencerbutler.com/go/download?src=group-mirror-a.",
    ].join("\n\n");
    expect(extractSrcTags(body)).toEqual(["group-mirror-a", "group-mirror-b"]);
  });

  it("returns nothing when there is no src parameter", () => {
    expect(extractSrcTags("No links here")).toEqual([]);
    expect(extractSrcTags("https://example.com/?source=foo")).toEqual([]);
    expect(extractSrcTags("")).toEqual([]);
  });
});

describe("campaignPlainText", () => {
  it("strips bold and heading markers and spells out links", () => {
    expect(campaignPlainText(`# Hi\n\n**bold** [go](${URL})`)).toBe(`Hi\n\nbold go: ${URL}`);
  });
});
