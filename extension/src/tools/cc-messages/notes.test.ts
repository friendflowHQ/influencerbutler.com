import { describe, expect, it } from "vitest";
import {
  MAX_NOTES,
  MAX_NOTE_CHARS,
  getBrandNote,
  normalizeBrandNotes,
  setBrandNote,
  type BrandNotes,
} from "./notes";

describe("setBrandNote / getBrandNote", () => {
  it("stores a note under the normalized brand key", () => {
    const notes = setBrandNote({}, "CLOCKY™", "  wants   content by Friday ", 100);
    expect(getBrandNote(notes, "clocky")).toEqual({ note: "wants content by Friday", updatedAt: 100 });
  });

  it("clears the note when the text is blank", () => {
    const notes = setBrandNote({}, "CLOCKY", "x", 1);
    expect(setBrandNote(notes, "CLOCKY", "   ", 2)).toEqual({});
  });

  it("truncates to the character limit", () => {
    const notes = setBrandNote({}, "CLOCKY", "a".repeat(MAX_NOTE_CHARS + 50), 1);
    expect(getBrandNote(notes, "CLOCKY")!.note).toHaveLength(MAX_NOTE_CHARS);
  });

  it("evicts the least recently updated note past the cap", () => {
    let notes: BrandNotes = {};
    for (let i = 0; i < MAX_NOTES; i += 1) notes = setBrandNote(notes, `Brand ${i}`, "n", i + 1);
    notes = setBrandNote(notes, "Newcomer", "n", 10_000);
    expect(Object.keys(notes)).toHaveLength(MAX_NOTES);
    expect(getBrandNote(notes, "Brand 0")).toBeNull();
    expect(getBrandNote(notes, "Newcomer")).not.toBeNull();
  });

  it("ignores an empty brand", () => {
    expect(setBrandNote({}, "  ", "x", 1)).toEqual({});
  });
});

describe("normalizeBrandNotes", () => {
  it("drops malformed rows and keeps good ones", () => {
    const out = normalizeBrandNotes({
      good: { note: "hi", updatedAt: 5 },
      blank: { note: "  ", updatedAt: 1 },
      bad: "nope",
      nul: null,
    });
    expect(out).toEqual({ good: { note: "hi", updatedAt: 5 } });
  });

  it("returns an empty map for non-objects", () => {
    expect(normalizeBrandNotes(undefined)).toEqual({});
    expect(normalizeBrandNotes("x")).toEqual({});
  });
});
