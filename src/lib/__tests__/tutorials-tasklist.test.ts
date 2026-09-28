/**
 * Summary: Renderer tests for the task-list extension in tutorials.ts, plus
 *   a regression sweep proving no legacy tutorial accidentally triggers the
 *   new syntax.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { renderMarkdown } from "../tutorials";

describe("renderMarkdown task lists", () => {
  it("renders an unchecked task item with an explicit anchor", () => {
    const html = renderMarkdown("- [ ] Film one review video {#film-first}", { docId: "aip-course-05" });
    expect(html).toContain('<ul class="task-list">');
    expect(html).toContain('data-step-id="aip-course-05:film-first"');
    expect(html).toContain("<span>Film one review video</span>");
    expect(html).not.toContain("checked");
    expect(html).toContain("</ul>");
  });

  it("normalizes [x] to unchecked (state is user data, not content)", () => {
    const html = renderMarkdown("- [x] Already done {#done-step}", { docId: "doc" });
    expect(html).toContain('data-step-id="doc:done-step"');
    expect(html).not.toContain("checked");
  });

  it("falls back to a positional counter when no anchor is given", () => {
    const html = renderMarkdown("- [ ] First\n- [ ] Second", { docId: "doc" });
    expect(html).toContain('data-step-id="doc:s1"');
    expect(html).toContain('data-step-id="doc:s2"');
  });

  it("omits the docId prefix when none is provided", () => {
    const html = renderMarkdown("- [ ] Step {#a-step}");
    expect(html).toContain('data-step-id="a-step"');
  });

  it("rejects invalid anchors (kept as literal text, counter id used)", () => {
    const html = renderMarkdown("- [ ] Weird {#Not_Valid!}", { docId: "doc" });
    expect(html).toContain('data-step-id="doc:s1"');
    expect(html).toContain("{#Not_Valid!}");
  });

  it("HTML-escapes step text", () => {
    const html = renderMarkdown('- [ ] Use <b>bold</b> & "quotes" {#esc}', { docId: "doc" });
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot;");
    expect(html).not.toContain("<b>");
  });

  it("keeps plain bullets and task items in separate lists", () => {
    const html = renderMarkdown("- plain one\n- [ ] task one {#t1}\n- plain two", { docId: "doc" });
    expect(html).toBe(
      [
        "<ul>",
        "<li>plain one</li>",
        "</ul>",
        '<ul class="task-list">',
        '<li class="task-item"><label><input type="checkbox" data-step-id="doc:t1" /><span>task one</span></label></li>',
        "</ul>",
        "<ul>",
        "<li>plain two</li>",
        "</ul>",
      ].join("\n"),
    );
  });

  it("leaves non-task bullet rendering unchanged", () => {
    const html = renderMarkdown("- alpha\n- **beta**");
    expect(html).toBe('<ul>\n<li>alpha</li>\n<li><strong>beta</strong></li>\n</ul>');
  });
});

describe("legacy tutorial regression", () => {
  it("no existing tutorial produces task-list markup", async () => {
    const root = path.join(process.cwd(), "content", "tutorials");
    // These tutorials use task lists on purpose; the sweep only guards
    // tutorials that never opted in.
    const optedIn = [
      "aip-course-",
      "getting-started-influencer-butler",
      "run-in-cloud",
      "share-products-manually",
    ];
    const files = (await readdir(root)).filter(
      (f) => f.endsWith(".mdx") && !optedIn.some((prefix) => f.startsWith(prefix)),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = await readFile(path.join(root, file), "utf8");
      const html = renderMarkdown(raw);
      expect(html, `unexpected task-list markup in ${file}`).not.toContain("data-step-id");
      expect(html, `unexpected task-list markup in ${file}`).not.toContain("task-item");
    }
  });
});
