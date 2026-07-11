import { describe, expect, it } from "vitest";
import { maskEmail } from "../mask-email";

describe("maskEmail", () => {
  it("keeps the first local char and the full domain", () => {
    expect(maskEmail("elizabethdean30@gmail.com")).toBe("e***@gmail.com");
    expect(maskEmail("kay@outlook.com")).toBe("k***@outlook.com");
  });

  it("trims surrounding whitespace before masking", () => {
    expect(maskEmail("  bob@example.org  ")).toBe("b***@example.org");
  });

  it("masks a single-character local part", () => {
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });

  it("uses the last @ so plus/sub-addressing does not leak the local part", () => {
    expect(maskEmail("first.last+promo@company.co.uk")).toBe("f***@company.co.uk");
  });

  it("returns null when there is nothing safe to show", () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
    expect(maskEmail("")).toBeNull();
    expect(maskEmail("   ")).toBeNull();
    expect(maskEmail("noatsign")).toBeNull();
    expect(maskEmail("@nolocal.com")).toBeNull();
    expect(maskEmail("nodomain@")).toBeNull();
  });
});
