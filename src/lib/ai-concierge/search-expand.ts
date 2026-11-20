/**
 * Query expansion for the help search: a small domain synonym list, light
 * stemming, and typo correction against the words that actually appear in the
 * tutorials. Pure functions (the vocabulary is passed in) so they are easy to
 * test. searchHelp in agent.ts weights the original words 1, typo corrections 1,
 * and synonyms or stems less, so expansion helps recall without flooding results.
 */

export type WeightedTerm = { term: string; weight: number };

const SYNONYM_WEIGHT = 0.6;

// Shorthand and everyday words people type, mapped to the words our guides use.
const SYNONYMS: Record<string, string[]> = {
  ig: ["instagram"],
  insta: ["instagram"],
  fb: ["facebook"],
  yt: ["youtube"],
  tt: ["tiktok"],
  cc: ["creator", "connections"],
  login: ["sign"],
  signin: ["sign"],
  logout: ["sign"],
  bug: ["error"],
  broken: ["error"],
  crash: ["error"],
  crashed: ["error"],
  crashing: ["error"],
  stopped: ["paused"],
  stops: ["paused"],
  macbook: ["mac"],
  imac: ["mac"],
  pc: ["windows"],
  laptop: ["computer"],
  download: ["install"],
  downloading: ["install"],
  subscription: ["plan"],
  billing: ["plan"],
  refund: ["cancel"],
  money: ["earnings", "commission"],
  commissions: ["commission"],
  earn: ["earnings"],
};

/** Extra word forms from simple suffixes: posting -> post, deals -> deal. */
export function stemVariants(term: string): string[] {
  const out: string[] = [];
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (term.length >= suffix.length + 4 && term.endsWith(suffix)) out.push(term.slice(0, -suffix.length));
  }
  return out;
}

/** True when a and b differ by at most `max` single-character edits. */
export function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

/** The closest vocabulary word within the typo allowance, or null. */
export function closestWord(term: string, vocab: ReadonlySet<string>): string | null {
  const max = term.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestLen = Infinity;
  for (const w of vocab) {
    // A typo almost never changes the first letter; skipping others keeps this fast.
    if (w[0] !== term[0] || Math.abs(w.length - term.length) > max) continue;
    if (withinEdits(term, w, max) && Math.abs(w.length - term.length) < bestLen) {
      best = w;
      bestLen = Math.abs(w.length - term.length);
    }
  }
  return best;
}

/**
 * Expand lowercase query tokens (length 2 or more) into weighted search terms.
 * Tokens of 2 letters survive only to look up a synonym (ig, fb, yt, pc, cc).
 */
export function expandTerms(tokens: string[], vocab: ReadonlySet<string>, isStopword: (t: string) => boolean): WeightedTerm[] {
  const out = new Map<string, number>();
  const add = (term: string, weight: number) => {
    if (term.length < 3 || isStopword(term)) return;
    if ((out.get(term) ?? 0) < weight) out.set(term, weight);
  };
  for (const t of tokens) {
    for (const syn of SYNONYMS[t] ?? []) add(syn, SYNONYM_WEIGHT);
    if (t.length < 3 || isStopword(t)) continue;
    add(t, 1);
    for (const stem of stemVariants(t)) add(stem, SYNONYM_WEIGHT);
    if (t.length >= 5 && !/\d/.test(t) && !vocab.has(t)) {
      const fixed = closestWord(t, vocab);
      if (fixed) add(fixed, 1);
    }
  }
  return [...out.entries()].map(([term, weight]) => ({ term, weight }));
}

/** Lowercase alphanumeric words (3 to 20 letters) in a text, for the typo vocabulary. */
export function vocabularyOf(texts: string[]): Set<string> {
  const vocab = new Set<string>();
  for (const text of texts) {
    for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 3 && w.length <= 20) vocab.add(w);
    }
  }
  return vocab;
}
