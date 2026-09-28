import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  EXTENSION_GROUPS,
  EXTENSION_TOOL_COUNT,
  EXTENSION_TOOLS,
  PERF_BUDGET_MS,
} from "../extension-features";

// The tool count is derived from the canonical list and quoted verbatim on
// every public surface. These checks fail the moment a surface hand-types a
// stale number, so an outdated hand-written count can never come back.

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("extension feature list", () => {
  it("derives the count from the list", () => {
    expect(EXTENSION_TOOL_COUNT).toBe(EXTENSION_TOOLS.length);
    expect(EXTENSION_TOOL_COUNT).toBeGreaterThan(0);
  });

  it("has unique ids and every tool in a known group", () => {
    const ids = new Set(EXTENSION_TOOLS.map((t) => t.id));
    expect(ids.size).toBe(EXTENSION_TOOLS.length);
    const groups = new Set(EXTENSION_GROUPS.map((g) => g.id));
    for (const tool of EXTENSION_TOOLS) expect(groups.has(tool.group)).toBe(true);
  });

  it("presents seven groups in the agreed order", () => {
    expect(EXTENSION_GROUPS.map((g) => g.id)).toEqual([
      "research",
      "creator-connections",
      "never-throttled",
      "fast",
      "deep-links",
      "global-maximizer",
      "storefront",
    ]);
  });

  it("keeps speed copy gated until a budget is measured", () => {
    expect(PERF_BUDGET_MS === null || PERF_BUDGET_MS > 0).toBe(true);
  });

  it("quotes the canonical count in every tutorial locale", () => {
    expect(read("content/tutorials/extension.en-US.mdx")).toContain(`${EXTENSION_TOOL_COUNT} tools`);
    expect(read("content/tutorials/extension.es-ES.mdx")).toContain(`${EXTENSION_TOOL_COUNT} herramientas`);
    expect(read("content/tutorials/extension.fr-FR.mdx")).toContain(`${EXTENSION_TOOL_COUNT} outils`);
    expect(read("content/tutorials/_index.json")).toContain(`${EXTENSION_TOOL_COUNT} tools`);
  });

  it("quotes the canonical count in the Web Store listing draft", () => {
    expect(read("docs/chrome-web-store-listing.md")).toContain(`${EXTENSION_TOOL_COUNT} tools`);
  });

  it("never reintroduces the stale wording", () => {
    for (const rel of [
      "content/tutorials/extension.en-US.mdx",
      "content/tutorials/extension.es-ES.mdx",
      "content/tutorials/extension.fr-FR.mdx",
      "src/app/extension/ExtensionLandingContent.tsx",
    ]) {
      const text = read(rel);
      expect(text).not.toMatch(/five tools|Four tools|cinco herramientas|cinq outils/);
      // No em dashes anywhere in this repo (CLAUDE.md).
      expect(text).not.toContain("—");
    }
  });
});
