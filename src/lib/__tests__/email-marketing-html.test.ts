/**
 * Summary: Unit tests for plainTextToTrackableHtml, the text->HTML renderer that
 * lets Resend inject its open/click pixel for open-tracked sequences.
 * Dependencies: vitest, ../email-marketing.
 */

import { describe, it, expect } from "vitest";
import { plainTextToTrackableHtml } from "../email-marketing";

describe("plainTextToTrackableHtml", () => {
  it("escapes HTML-special characters so text renders literally", () => {
    const html = plainTextToTrackableHtml("Tom & Jerry <3 \"quotes\"");
    expect(html).toContain("Tom &amp; Jerry &lt;3 &quot;quotes&quot;");
    // No raw, unescaped angle bracket from the input survived.
    expect(html).not.toContain("<3");
  });

  it("turns a bare https URL into a link without swallowing trailing punctuation", () => {
    const html = plainTextToTrackableHtml(
      "Free for 14 days: https://www.influencerbutler.com/go/download.",
    );
    expect(html).toContain(
      '<a href="https://www.influencerbutler.com/go/download">https://www.influencerbutler.com/go/download</a>',
    );
    // The sentence's period stays outside the link.
    expect(html).toContain("</a>.");
  });

  it("preserves line breaks as <br>", () => {
    const html = plainTextToTrackableHtml("Line one\nLine two");
    expect(html).toContain("Line one<br>");
    expect(html).toContain("Line two");
  });

  it("wraps output in a single styled div", () => {
    const html = plainTextToTrackableHtml("hi");
    expect(html.startsWith("<div ")).toBe(true);
    expect(html.trim().endsWith("</div>")).toBe(true);
  });
});
