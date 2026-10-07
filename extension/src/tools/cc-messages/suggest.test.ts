import { describe, expect, it } from "vitest";
import { detectIntent, suggestTemplateId } from "./suggest";

describe("detectIntent", () => {
  it("reads a sample offer", () => {
    expect(detectIntent("If you still need a sample fill in this form")).toBe("sample");
  });

  it("prefers address over sample when both appear", () => {
    expect(detectIntent("Happy to send a sample! What is your shipping address?")).toBe("address");
  });

  it("reads a request for the post link", () => {
    expect(detectIntent("Please send us the link to your post when it is live")).toBe("link");
  });

  it("reads thanks", () => {
    expect(detectIntent("Thank you so much!")).toBe("thanks");
  });

  it("returns null for blank or unrelated text", () => {
    expect(detectIntent("")).toBeNull();
    expect(detectIntent("Our campaign ends Friday")).toBeNull();
  });
});

describe("suggestTemplateId", () => {
  const templates = [
    { id: "a", label: "Intro pitch", body: "Hi {brandName}, I would love to feature you" },
    { id: "b", label: "Sample request", body: "Could you send a sample to my address" },
    { id: "c", label: "Thank you", body: "Thanks so much" },
  ];

  it("picks the template whose label fits the intent", () => {
    expect(suggestTemplateId(templates, "sample")).toBe("b");
    expect(suggestTemplateId(templates, "thanks")).toBe("c");
  });

  it("ignores a template that only matches in the body", () => {
    expect(suggestTemplateId(templates, "address")).toBeNull();
  });

  it("returns null with no intent or no templates", () => {
    expect(suggestTemplateId(templates, null)).toBeNull();
    expect(suggestTemplateId([], "sample")).toBeNull();
  });
});
