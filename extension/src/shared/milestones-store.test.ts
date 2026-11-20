import { describe, expect, it } from "vitest";
import { isProductSend } from "./milestones-store";

const entry = (action: string, over: Record<string, unknown> = {}) => ({ at: 1, dir: "to-app", action, outcome: "ok", ...over });

describe("isProductSend", () => {
  it("counts successful product sends", () => {
    for (const action of ["content.push", "deal.push.batch", "voiceover.push", "collaboration.add", "link.mint", "idealist.push"]) {
      expect(isProductSend(entry(action))).toBe(true);
    }
  });

  it("ignores automatic pushes, failures, and other directions", () => {
    expect(isProductSend(entry("settings.push"))).toBe(false);
    expect(isProductSend(entry("findings.push"))).toBe(false);
    expect(isProductSend(entry("affiliate.mint"))).toBe(false);
    expect(isProductSend(entry("content.push", { outcome: "failed" }))).toBe(false);
    expect(isProductSend(entry("content.push", { dir: "from-app" }))).toBe(false);
    expect(isProductSend(null)).toBe(false);
    expect(isProductSend("x")).toBe(false);
    expect(isProductSend({ dir: "to-app", outcome: "ok" })).toBe(false);
  });
});
