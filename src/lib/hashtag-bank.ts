// hashtag-bank.ts - curated hashtag sets + a pure generator for the free
// Hashtag Generator tool. No I/O, fully client-safe.
//
// The strategy mirrors what works for Amazon-influencer discovery: mix a few
// BROAD reach tags, several NICHE tags matched to the creator's topic, and a
// handful of AFFILIATE/shopping intent tags. Callers pass a niche keyword; we
// pick the closest bank and interleave broad + niche + affiliate tags up to the
// requested count.

export type NicheKey =
  | "beauty"
  | "fashion"
  | "home"
  | "tech"
  | "fitness"
  | "food"
  | "baby"
  | "pets"
  | "general";

// Broad, high-volume tags that lift reach on almost any creator post.
const BROAD_TAGS = [
  "amazonfinds",
  "founditonamazon",
  "amazonmusthaves",
  "amazoninfluencer",
  "amazonhaul",
  "tiktokmademebuyit",
  "shopwithme",
  "affiliate",
];

// Shopping / affiliate intent tags, layered onto every set.
const AFFILIATE_TAGS = [
  "amazonstorefront",
  "amazondeals",
  "linkinbio",
  "amazonpartner",
  "founditonamazonhome",
];

// Per-niche tag banks. Keys map to a normalized niche family.
const NICHE_TAGS: Record<Exclude<NicheKey, "general">, string[]> = {
  beauty: [
    "beautyfinds", "skincareroutine", "makeuptutorial", "cleanbeauty",
    "beautytok", "skincaretips", "makeupaddict", "beautyhaul",
  ],
  fashion: [
    "amazonfashion", "ootd", "outfitinspo", "fashionfinds",
    "styletips", "amazonstyle", "affordablefashion", "wardrobestaples",
  ],
  home: [
    "homedecor", "amazonhome", "homefinds", "organizationhacks",
    "kitchenfinds", "homedecorideas", "cozyhome", "homeorganization",
  ],
  tech: [
    "techfinds", "gadgets", "techtok", "amazontech",
    "gadgetlover", "smarthome", "techdeals", "coolgadgets",
  ],
  fitness: [
    "fitnessfinds", "homegym", "workoutmotivation", "fitnessgear",
    "gymtok", "healthyliving", "fitnessjourney", "activewear",
  ],
  food: [
    "kitchengadgets", "foodtok", "recipeideas", "kitchenfinds",
    "amazonkitchen", "cookingtools", "mealprep", "foodie",
  ],
  baby: [
    "babymusthaves", "momsofinstagram", "babyfinds", "toddlerlife",
    "newmom", "babyregistry", "momlife", "parentinghacks",
  ],
  pets: [
    "petsofinstagram", "dogmom", "petfinds", "petmusthaves",
    "catsofinstagram", "doglover", "petparent", "amazonpets",
  ],
};

// Keyword -> niche routing. First substring hit wins.
const NICHE_MATCHERS: { match: RegExp; key: Exclude<NicheKey, "general"> }[] = [
  { match: /beaut|makeup|skincare|cosmet|hair|nail/, key: "beauty" },
  { match: /fashion|outfit|cloth|style|wardrobe|apparel|shoe/, key: "fashion" },
  { match: /home|decor|kitchen|organiz|clean|furnitur/, key: "home" },
  { match: /tech|gadget|electronic|smart|computer|phone/, key: "tech" },
  { match: /fit|gym|workout|health|yoga|run|active/, key: "fitness" },
  { match: /food|recipe|cook|meal|snack|bak/, key: "food" },
  { match: /baby|toddler|mom|parent|kid|nursery/, key: "baby" },
  { match: /pet|dog|cat|puppy|kitten/, key: "pets" },
];

/** Resolve a free-text niche/keyword to the closest bank key. */
export function resolveNiche(input: string | null | undefined): NicheKey {
  if (!input) return "general";
  const norm = input.trim().toLowerCase();
  if (!norm) return "general";
  for (const m of NICHE_MATCHERS) {
    if (m.match.test(norm)) return m.key;
  }
  return "general";
}

/**
 * Build up to `count` hashtags for a niche keyword. Deterministic given the
 * same inputs. Interleaves broad + niche + affiliate tags, dedupes, and (when a
 * niche is recognized) seeds a couple of tags directly from the keyword so the
 * set feels tailored. Every tag is returned with a leading '#'.
 */
export function buildHashtags(input: string | null | undefined, count = 20): string[] {
  const niche = resolveNiche(input);
  const nicheTags = niche === "general" ? [] : NICHE_TAGS[niche];

  // Seed from the raw keyword so e.g. "coffee mug" yields #coffeemug.
  const keywordTags: string[] = [];
  const cleaned = (input ?? "").trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
  if (cleaned) {
    const collapsed = cleaned.replace(/\s+/g, "");
    if (collapsed.length >= 3 && collapsed.length <= 24) keywordTags.push(collapsed);
    const words = cleaned.split(/\s+/).filter((w) => w.length >= 3);
    if (words.length > 1) keywordTags.push(...words.slice(0, 2));
  }

  // Interleave sources so the final list stays varied even when truncated.
  const ordered: string[] = [];
  const sources = [keywordTags, nicheTags, BROAD_TAGS, AFFILIATE_TAGS];
  let added = true;
  let i = 0;
  while (added) {
    added = false;
    for (const src of sources) {
      if (i < src.length) {
        ordered.push(src[i]);
        added = true;
      }
    }
    i += 1;
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of ordered) {
    const t = tag.replace(/^#/, "");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(`#${t}`);
    if (out.length >= count) break;
  }
  return out;
}

/** Niche options offered as quick-pick chips in the UI. */
export const NICHE_SUGGESTIONS = [
  "Beauty", "Fashion", "Home", "Tech", "Fitness", "Food", "Baby", "Pets",
];
