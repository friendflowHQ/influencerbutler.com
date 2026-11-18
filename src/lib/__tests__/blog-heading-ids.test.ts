import { describe, expect, it } from "vitest";
import { headingSlug, renderMarkdown } from "../blog-markdown";

describe("blog heading ids", () => {
  it("gives h2 and h3 a kebab-case id", () => {
    const html = renderMarkdown("## How to make an Amazon favorites page\n\n### Step 1: sign in");
    expect(html).toContain('<h2 id="how-to-make-an-amazon-favorites-page">');
    expect(html).toContain('<h3 id="step-1-sign-in">');
  });

  it("leaves h1 and h4 without ids", () => {
    const html = renderMarkdown("# Title\n\n#### Small");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h4>Small</h4>");
  });

  it("de-duplicates repeated headings", () => {
    const html = renderMarkdown("## FAQ\n\n## FAQ");
    expect(html).toContain('<h2 id="faq">');
    expect(html).toContain('<h2 id="faq-2">');
  });

  it("strips markup and keeps link text", () => {
    expect(headingSlug("Use **[Storefront Butler](/features/x)** & `code`")).toBe(
      "use-storefront-butler-and-code",
    );
  });
});
