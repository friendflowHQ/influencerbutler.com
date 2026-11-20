import { describe, it, expect } from "vitest";
import { expandTerms, withinEdits, closestWord, stemVariants, vocabularyOf } from "../search-expand";

const noStop = () => false;
const vocab = vocabularyOf(["Connect your Instagram account and post deals with the Facebook butler"]);

describe("search expansion", () => {
  it("counts edits", () => {
    expect(withinEdits("instagram", "instagrm", 1)).toBe(true);
    expect(withinEdits("instagram", "facebook", 2)).toBe(false);
  });

  it("corrects a typo to a word in the guides", () => {
    expect(closestWord("instagrm", vocab)).toBe("instagram");
    expect(closestWord("zzzzzzz", vocab)).toBeNull();
  });

  it("stems common suffixes", () => {
    expect(stemVariants("posting")).toContain("post");
    expect(stemVariants("deals")).toContain("deal");
  });

  it("expands shorthand and keeps the original at full weight", () => {
    const terms = expandTerms(["ig", "posting"], vocab, noStop);
    const byTerm = Object.fromEntries(terms.map((t) => [t.term, t.weight]));
    expect(byTerm["instagram"]).toBe(0.6);
    expect(byTerm["posting"]).toBe(1);
    expect(byTerm["post"]).toBe(0.6);
  });

  it("adds a typo correction at full weight and skips stopwords", () => {
    const terms = expandTerms(["facebok", "the"], vocab, (t) => t === "the");
    expect(terms.find((t) => t.term === "facebook")?.weight).toBe(1);
    expect(terms.find((t) => t.term === "the")).toBeUndefined();
  });
});
