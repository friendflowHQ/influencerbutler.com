// The creator's post FORMULAS for AI Post: a layout with {{tokens}} the server fills
// with the product's real facts before the model rewrites it (see
// src/lib/ai-post.ts on the site). Mirrors the desktop Deals Butler's formulas, so
// a layout that works there can be pasted here. Built-ins are percent-only and
// carry an (ad) disclosure, in line with Amazon's no-exact-price policy. Custom
// formulas live in their own chrome.storage.local key (not the shared "ib" blob),
// so adding them needs no schema migration; every read/write is try/catch'd so a
// blocked storage area just leaves the built-ins.

export type PostFormula = {
  id: string;
  name: string;
  post: string;
  comment?: string;
  builtIn?: boolean;
};

export const FORMULA_CAP = 20;
const STORE_KEY = "ib_ai_post";

// Tokens the server understands (anything else drops its line). Shown as a hint
// in the formula editor.
export const FORMULA_TOKENS = [
  "{{title}}",
  "{{brand}}",
  "{{store}}",
  "{{percentOff}}",
  "{{couponPercentOff}}",
  "{{promoPercentOff}}",
  "{{totalPercentOff}}",
  "{{promoCode}}",
  "{{promoText}}",
  "{{event}}",
  "{{url}}",
] as const;

export const BUILT_IN_FORMULAS: PostFormula[] = [
  {
    id: "builtin-price-drop",
    name: "Price drop",
    post: "🔥 Price drop: {{percentOff}}% off!\n{{title}}\n{{promoText}}\n👉 Grab it here: {{url}} (ad)",
    builtIn: true,
  },
  {
    id: "builtin-promo-code",
    name: "Promo code",
    post: "{{title}}\n{{percentOff}}% off right now\n🏷️ Use code {{promoCode}} for {{promoPercentOff}}% off more\n{{url}} (ad)",
    builtIn: true,
  },
  {
    id: "builtin-coupon-stack",
    name: "Coupon stack",
    post: "💸 Stack it: {{totalPercentOff}}% off total\n{{title}}\nClip the coupon on the page before you check out\n{{url}} (ad)",
    builtIn: true,
  },
  {
    id: "builtin-short",
    name: "Short and sweet",
    post: "{{title}}\n{{percentOff}}% off\n{{url}} (ad)",
    builtIn: true,
  },
];

type Stored = { custom: PostFormula[]; selectedId: string | null };

function clampFormula(f: unknown): PostFormula | null {
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
  const post = typeof o.post === "string" ? o.post.slice(0, 1500) : "";
  if (!id || !name || !post.trim()) return null;
  const comment = typeof o.comment === "string" && o.comment.trim() ? o.comment.slice(0, 400) : undefined;
  return { id, name, post, ...(comment ? { comment } : {}) };
}

async function read(): Promise<Stored> {
  try {
    const raw = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as Partial<Stored> | undefined;
    const custom = Array.isArray(raw?.custom)
      ? raw.custom.map(clampFormula).filter((f): f is PostFormula => f !== null).slice(0, FORMULA_CAP)
      : [];
    return { custom, selectedId: typeof raw?.selectedId === "string" ? raw.selectedId : null };
  } catch {
    return { custom: [], selectedId: null };
  }
}

async function write(next: Stored): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORE_KEY]: next });
  } catch {
    // storage blocked: the in-memory result still works for this session
  }
}

function newId(): string {
  try {
    return `custom-${crypto.randomUUID()}`;
  } catch {
    return `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

// Custom formulas first (they are the creator's own), then the built-ins.
export async function listFormulas(): Promise<{ formulas: PostFormula[]; selectedId: string }> {
  const { custom, selectedId } = await read();
  const formulas = [...custom, ...BUILT_IN_FORMULAS];
  const chosen = formulas.find((f) => f.id === selectedId) ?? (formulas[0] as PostFormula);
  return { formulas, selectedId: chosen.id };
}

export async function selectFormula(id: string): Promise<void> {
  const stored = await read();
  await write({ ...stored, selectedId: id });
}

export type SaveFormulaResult = { ok: true; formula: PostFormula } | { ok: false; error: string };

// Save under a new id, or overwrite the custom formula with the same name
// (case-insensitive) so re-saving a name updates it instead of piling up copies.
export async function saveFormula(rawName: string, rawPost: string, rawComment?: string): Promise<SaveFormulaResult> {
  const name = rawName.trim().slice(0, 60);
  const post = rawPost.trim().slice(0, 1500);
  if (!name) return { ok: false, error: "Give the formula a name." };
  if (!post) return { ok: false, error: "The formula is empty." };
  const comment = rawComment?.trim() ? rawComment.trim().slice(0, 400) : undefined;
  const stored = await read();
  const existing = stored.custom.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (!existing && stored.custom.length >= FORMULA_CAP) {
    return { ok: false, error: `You have reached the ${FORMULA_CAP}-formula limit. Delete one first.` };
  }
  const formula: PostFormula = { id: existing?.id ?? newId(), name, post, ...(comment ? { comment } : {}) };
  const custom = existing ? stored.custom.map((f) => (f.id === formula.id ? formula : f)) : [...stored.custom, formula];
  await write({ custom, selectedId: formula.id });
  return { ok: true, formula };
}

export async function deleteFormula(id: string): Promise<void> {
  const stored = await read();
  await write({
    custom: stored.custom.filter((f) => f.id !== id),
    selectedId: stored.selectedId === id ? null : stored.selectedId,
  });
}
