// Pure helpers for the Benable badge: normalizing titles and joining a rendered
// list card back to the rec (hence ASIN) the MAIN-world hook captured. Kept free
// of DOM and chrome APIs so it is unit-testable on its own.

// One Amazon item from a Benable list, as republished by src/content/benable-hook.ts.
export type BenableRec = {
  asin: string;
  title: string | null;
  // rec_object_photos ids; each also appears in a card's <img> src, so it is the
  // primary join key from a rendered card back to this rec.
  photoIds: string[];
};

// Lowercased, punctuation-stripped, whitespace-collapsed title, so a card's
// visible title matches the rec's display_name even across minor formatting.
export function normalizeTitle(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Indexes over a rec list for the two joins. A rec is indexed by every one of
// its photo ids and by its normalized title.
export type BenableIndex = {
  recs: BenableRec[];
  byPhotoId: Map<string, BenableRec>;
  byTitle: Map<string, BenableRec>;
};

export function buildIndex(recs: BenableRec[]): BenableIndex {
  const byPhotoId = new Map<string, BenableRec>();
  const byTitle = new Map<string, BenableRec>();
  for (const rec of recs) {
    for (const pid of rec.photoIds) if (pid) byPhotoId.set(pid, rec);
    const key = normalizeTitle(rec.title);
    if (key) byTitle.set(key, rec);
  }
  return { recs, byPhotoId, byTitle };
}

// Join a rendered card to its rec. Prefers the photo id (present in both the
// card's <img> src and the rec's rec_object_photos); falls back to an exact
// normalized-title match, then to the longest rec title that appears as a
// substring of the card's text (Benable stores a handful of items under generic
// "<name> - Amazon.com" titles whose photo ids do not line up with the DOM).
// Returns null when nothing matches, so the caller leaves the card undecorated.
export function matchRec(
  index: BenableIndex,
  card: { photoId?: string | null; text?: string | null },
): BenableRec | null {
  if (card.photoId) {
    const byPhoto = index.byPhotoId.get(card.photoId);
    if (byPhoto) return byPhoto;
  }
  const text = normalizeTitle(card.text);
  if (!text) return null;
  const exact = index.byTitle.get(text);
  if (exact) return exact;
  let best: BenableRec | null = null;
  let bestLen = 0;
  for (const rec of index.recs) {
    const key = normalizeTitle(rec.title);
    // Require a meaningfully long title so a two-word generic title does not
    // grab an unrelated card by coincidence.
    if (key.length < 6) continue;
    if (key.length > bestLen && text.includes(key)) {
      best = rec;
      bestLen = key.length;
    }
  }
  return best;
}
