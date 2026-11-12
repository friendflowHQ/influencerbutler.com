/**
 * Summary: Renderer tests for annotated tutorial screenshots: standalone
 *   figure lines with captions, `{locale}` path resolution with en-US
 *   fallback, figures attached to list items, and numbered-list continuity
 *   when a screenshot sits between two steps.
 */
import { describe, expect, it } from "vitest";
import { makeImageResolver, renderMarkdown } from "../tutorials";

describe("renderMarkdown screenshots", () => {
  it("renders a standalone image line as a captioned figure", () => {
    const html = renderMarkdown('![Pricecrash dial](/assets/tutorials/x/en-US/01.webp "Turn the dial down")');
    expect(html).toContain('<figure class="tut-shot">');
    expect(html).toContain('src="/assets/tutorials/x/en-US/01.webp"');
    expect(html).toContain('alt="Pricecrash dial"');
    expect(html).toContain("<figcaption>Turn the dial down</figcaption>");
  });

  it("drops images outside /assets/", () => {
    expect(renderMarkdown("![x](https://evil.example/x.png)")).not.toContain("<img");
    expect(renderMarkdown("![x](/assets/../secret.png)")).not.toContain("<img");
  });

  it("resolves {locale} to the page locale", () => {
    const html = renderMarkdown("![a](/assets/tutorials/x/{locale}/01.webp)", { locale: "fr-FR" });
    expect(html).toContain('src="/assets/tutorials/x/fr-FR/01.webp"');
  });

  it("falls back to en-US when the localized shot is not captured", () => {
    const available = new Set(["/assets/tutorials/x/en-US/01.webp"]);
    const resolve = makeImageResolver("es-ES", available);
    expect(resolve("/assets/tutorials/x/{locale}/01.webp")).toBe("/assets/tutorials/x/en-US/01.webp");
    available.add("/assets/tutorials/x/es-ES/01.webp");
    expect(resolve("/assets/tutorials/x/{locale}/01.webp")).toBe("/assets/tutorials/x/es-ES/01.webp");
  });

  it("attaches an indented figure to the preceding numbered step", () => {
    const html = renderMarkdown("1. Open Settings\n   ![s](/assets/a.webp)\n2. Click Save");
    expect(html).toMatch(/<li>Open Settings<figure class="tut-shot">[\s\S]*<\/figure><\/li>/);
    expect(html.match(/<ol/g)?.length).toBe(1);
  });

  it("keeps numbering when a figure separates two steps with blank lines", () => {
    const html = renderMarkdown("1. One\n2. Two\n\n![s](/assets/a.webp)\n\n3. Three");
    expect(html).toContain('<ol start="3">');
  });

  it("restarts numbering after a heading", () => {
    const html = renderMarkdown("1. One\n\n## Next\n\n1. Again");
    expect(html).not.toContain("start=");
  });

  it("still renders inline images inside text and strips the title", () => {
    const html = renderMarkdown('See ![icon](/assets/i.png "tip") here');
    expect(html).toContain('<img src="/assets/i.png" alt="icon" loading="lazy" />');
    expect(html).not.toContain("tip");
  });
});
