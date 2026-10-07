// Per-brand notes for the Messages drawer: one short line the creator jots on a
// brand ("wants content by Friday", "sample arrives 10/12") that shows on the
// thread card and as a pill on the conversation row. Stored locally in the
// extension (top-level `brandNotes`); pure helpers here so the limits are
// unit-tested.

import { normalizeBrand } from "../brand-keywords/normalize";

export type BrandNote = { note: string; updatedAt: number };
export type BrandNotes = Record<string, BrandNote>;

export const MAX_NOTE_CHARS = 140;
export const MAX_NOTES = 200;

export function noteKey(brand: string): string {
  return normalizeBrand(brand);
}

export function getBrandNote(notes: BrandNotes, brand: string): BrandNote | null {
  const key = noteKey(brand);
  if (!key) return null;
  return notes[key] ?? null;
}

// Set (or, with blank text, clear) a brand's note. Returns a new map. When the
// cap is hit, the least recently updated note is dropped to make room.
export function setBrandNote(
  notes: BrandNotes,
  brand: string,
  text: string,
  now: number,
): BrandNotes {
  const key = noteKey(brand);
  if (!key) return notes;
  const next: BrandNotes = { ...notes };
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
  if (!clean) {
    delete next[key];
    return next;
  }
  next[key] = { note: clean, updatedAt: now };
  const keys = Object.keys(next);
  if (keys.length > MAX_NOTES) {
    const oldest = keys
      .filter((k) => k !== key)
      .sort((a, b) => (next[a]?.updatedAt ?? 0) - (next[b]?.updatedAt ?? 0))[0];
    if (oldest) delete next[oldest];
  }
  return next;
}

// Coerce whatever storage hands back into a clean map (drops malformed rows).
export function normalizeBrandNotes(raw: unknown): BrandNotes {
  if (!raw || typeof raw !== "object") return {};
  const out: BrandNotes = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = value as Partial<BrandNote> | null;
    if (!key || !v || typeof v.note !== "string" || !v.note.trim()) continue;
    out[key] = {
      note: v.note.slice(0, MAX_NOTE_CHARS),
      updatedAt: typeof v.updatedAt === "number" && isFinite(v.updatedAt) ? v.updatedAt : 0,
    };
  }
  return out;
}
