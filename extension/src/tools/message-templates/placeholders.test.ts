import { describe, expect, it } from "vitest";
import { resolvePlaceholders } from "./placeholders";

describe("resolvePlaceholders", () => {
  it("fills a token it has a value for", () => {
    expect(resolvePlaceholders("Hi {brandName}!", { brandName: "Acme" })).toBe("Hi Acme!");
  });

  it("matches token names case-insensitively", () => {
    const out = resolvePlaceholders("{BrandName} / {BRANDNAME} / {brandname}", { brandName: "Acme" });
    expect(out).toBe("Acme / Acme / Acme");
  });

  it("fills multiple different tokens from the merged value map", () => {
    const out = resolvePlaceholders("Hi {brandName}, see {storefrontUrl}", {
      brandName: "Acme",
      storefrontUrl: "amazon.com/shop/me",
    });
    expect(out).toBe("Hi Acme, see amazon.com/shop/me");
  });

  it("strips a token it has no value for, leaving no braces", () => {
    const out = resolvePlaceholders("Hi {brandName}, visit {storefrontUrl}.", { brandName: "Acme" });
    expect(out).toBe("Hi Acme, visit.");
    expect(out).not.toMatch(/[{}]/);
  });

  it("strips a token whose value is empty or whitespace", () => {
    const out = resolvePlaceholders("A {mediakit} B", { mediakit: "   " });
    expect(out).toBe("A B");
  });

  it("tidies the double space a stripped mid-sentence token leaves", () => {
    const out = resolvePlaceholders("start {gone} end", {});
    expect(out).toBe("start end");
  });

  it("removes the space before punctuation a stripped token leaves", () => {
    const out = resolvePlaceholders("Thanks {name}, bye", {});
    expect(out).toBe("Thanks, bye");
  });

  it("keeps paragraph breaks but collapses excess blank lines", () => {
    const out = resolvePlaceholders("line one\n\n{gone}\n\nline two", {});
    expect(out).toBe("line one\n\nline two");
  });

  it("leaves a body with no tokens untouched (aside from trim)", () => {
    expect(resolvePlaceholders("Just a plain message.", { brandName: "Acme" })).toBe(
      "Just a plain message.",
    );
  });

  it("tolerates inner whitespace in a token", () => {
    expect(resolvePlaceholders("Hi { brandName }", { brandName: "Acme" })).toBe("Hi Acme");
  });
});
