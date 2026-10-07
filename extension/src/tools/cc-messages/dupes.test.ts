import { describe, expect, it } from "vitest";
import { findDuplicateIndexes, normalizeMessageText, type ThreadMessage } from "./dupes";

const blast = "Good morning! You can keep sharing Clocky content because the campaign is still live!";

const brand = (text: string): ThreadMessage => ({ sender: "brand", text });
const me = (text: string): ThreadMessage => ({ sender: "me", text });

describe("findDuplicateIndexes", () => {
  it("flags the second identical brand blast", () => {
    expect(findDuplicateIndexes([brand(blast), brand(blast)])).toEqual([1]);
  });

  it("ignores whitespace and case differences", () => {
    expect(findDuplicateIndexes([brand(blast), brand(`  ${blast.toUpperCase()}\n`)])).toEqual([1]);
  });

  it("keeps a repeat that comes after the creator replied", () => {
    expect(findDuplicateIndexes([brand(blast), me("Thanks, will do!"), brand(blast)])).toEqual([]);
  });

  it("flags every repeat in a run of three", () => {
    expect(findDuplicateIndexes([brand(blast), brand(blast), brand(blast)])).toEqual([1, 2]);
  });

  it("never folds short messages", () => {
    expect(findDuplicateIndexes([brand("Thanks!"), brand("Thanks!")])).toEqual([]);
  });

  it("does not compare across senders", () => {
    expect(findDuplicateIndexes([brand(blast), me(blast)])).toEqual([]);
  });

  it("resets on a message from an unknown sender", () => {
    expect(
      findDuplicateIndexes([brand(blast), { sender: "unknown", text: "x" }, brand(blast)]),
    ).toEqual([]);
  });
});

describe("normalizeMessageText", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeMessageText("  Hi   THERE\n")).toBe("hi there");
  });
});
