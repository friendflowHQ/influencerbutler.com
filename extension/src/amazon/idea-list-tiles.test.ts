import { describe, expect, it } from "vitest";
import { asinFromIdeaAttr } from "./idea-list-tiles";

describe("asinFromIdeaAttr", () => {
  it("reads the bare ASIN form", () => {
    expect(asinFromIdeaAttr("B01JGG5CH4")).toBe("B01JGG5CH4");
    expect(asinFromIdeaAttr("  B01JGG5CH4 ")).toBe("B01JGG5CH4");
  });

  it("reads the amzn1.asin. prefixed form (the outer tile attribute)", () => {
    expect(asinFromIdeaAttr("amzn1.asin.B01JGG5CH4")).toBe("B01JGG5CH4");
    expect(asinFromIdeaAttr("AMZN1.ASIN.B01JGG5CH4")).toBe("B01JGG5CH4");
  });

  it("uppercases a lowercase ASIN body", () => {
    expect(asinFromIdeaAttr("amzn1.asin.b01jgg5ch4")).toBe("B01JGG5CH4");
  });

  it("rejects values that are not a 10-char ASIN", () => {
    expect(asinFromIdeaAttr(null)).toBeNull();
    expect(asinFromIdeaAttr(undefined)).toBeNull();
    expect(asinFromIdeaAttr("")).toBeNull();
    expect(asinFromIdeaAttr("amzn1.asin.")).toBeNull();
    expect(asinFromIdeaAttr("amzn1.asin.B01JGG5")).toBeNull();
    expect(asinFromIdeaAttr("amzn1.asin.B01JGG5CH4X")).toBeNull();
    expect(asinFromIdeaAttr("amzn1.ideas.ZY4SIJ6VID6")).toBeNull();
  });
});
