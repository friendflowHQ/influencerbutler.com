import { describe, test, expect } from "vitest";
import {
  buildSubmitPayload,
  extractPiiBlock,
  splicePiiInto,
  validateScreenshot,
  isEmailShaped,
  PII_START,
  PII_END,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MAX_COUNT,
} from "./feedback-report-core";

describe("buildSubmitPayload", () => {
  test("trims fields and defaults attachLogs to true", () => {
    const p = buildSubmitPayload({
      type: "feature",
      title: "  Add dark mode  ",
      description: "  please  ",
      userEmail: "  me@example.com ",
    });
    expect(p).toEqual({
      type: "feature",
      title: "Add dark mode",
      description: "please",
      userEmail: "me@example.com",
      attachLogs: true,
    });
    expect(p.screenshots).toBeUndefined();
    expect(p.screenshotBase64).toBeUndefined();
  });

  test("preserves attachLogs:false and falls back unknown type to bug", () => {
    const p = buildSubmitPayload({ title: "x", attachLogs: false, type: "nope" as never });
    expect(p.type).toBe("bug");
    expect(p.attachLogs).toBe(false);
  });

  test("emits screenshots array plus the legacy first-image mirror", () => {
    const p = buildSubmitPayload({
      type: "bug",
      title: "t",
      screenshots: [
        { base64: "AAA", mime: "image/png", filename: "a.png", bytes: 10 },
        { base64: "BBB", mime: "image/jpeg", filename: "b.jpg", bytes: 20 },
      ],
    });
    expect(p.screenshots).toEqual([
      { base64: "AAA", mime: "image/png", filename: "a.png" },
      { base64: "BBB", mime: "image/jpeg", filename: "b.jpg" },
    ]);
    expect(p.screenshotBase64).toBe("AAA");
    expect(p.screenshotMime).toBe("image/png");
    expect(p.screenshotFilename).toBe("a.png");
  });
});

describe("PII splice round-trip", () => {
  const desc = [
    "== Failure ==",
    "Step: connect-amazon",
    "",
    PII_START,
    "Email: creator@example.com",
    PII_END,
  ].join("\n");

  test("extract then splice restores the identifiers", () => {
    const { stripped, block } = extractPiiBlock(desc);
    expect(stripped).not.toContain("creator@example.com");
    expect(block).toContain(PII_START);
    expect(block).toContain(PII_END);
    const restored = splicePiiInto(stripped, block);
    expect(restored).toContain("creator@example.com");
  });

  test("splice is idempotent when the block is already present", () => {
    expect(splicePiiInto(desc, `${PII_START}x${PII_END}`)).toBe(desc);
  });

  test("extract on text without markers is a no-op", () => {
    expect(extractPiiBlock("plain")).toEqual({ stripped: "plain", block: "" });
    expect(splicePiiInto("plain", "")).toBe("plain");
  });
});

describe("validateScreenshot", () => {
  test("accepts an allowed image under the caps", () => {
    expect(validateScreenshot({ mime: "image/png", bytes: 1000, currentCount: 0 })).toEqual({ ok: true });
  });
  test("rejects at the count cap", () => {
    const r = validateScreenshot({ mime: "image/png", bytes: 10, currentCount: SCREENSHOT_MAX_COUNT });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/up to 6/);
  });
  test("rejects a disallowed MIME", () => {
    expect(validateScreenshot({ mime: "image/svg+xml", bytes: 10, currentCount: 0 }).ok).toBe(false);
  });
  test("rejects an oversized image", () => {
    const r = validateScreenshot({ mime: "image/png", bytes: SCREENSHOT_MAX_BYTES + 1, currentCount: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Max is/);
  });
});

describe("isEmailShaped", () => {
  test.each([
    ["me@example.com", true],
    ["  spaced@example.co  ", true],
    ["not-an-email", false],
    ["missing@domain", false],
    ["", false],
  ])("%s -> %s", (input, expected) => {
    expect(isEmailShaped(input)).toBe(expected);
  });
});
