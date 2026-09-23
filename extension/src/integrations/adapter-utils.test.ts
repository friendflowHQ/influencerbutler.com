import { describe, expect, it } from "vitest";
import { TEST_TARGET_URL, testTargetUrl } from "./adapter-utils";

describe("testTargetUrl", () => {
  it("keeps the amazon.com target by default", () => {
    expect(testTargetUrl()).toBe(TEST_TARGET_URL);
    expect(testTargetUrl("amazon.com")).toBe("https://www.amazon.com/");
    expect(testTargetUrl("walmart.com")).toBe("https://www.amazon.com/");
  });

  it("uses the creator's home marketplace", () => {
    expect(testTargetUrl("amazon.co.uk")).toBe("https://www.amazon.co.uk/");
    expect(testTargetUrl("www.amazon.de")).toBe("https://www.amazon.de/");
  });
});
