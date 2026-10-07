// A brand-keyed index of the Creator Connections campaigns this install has
// seen, so the Messages drawer can show a brand's rate, open slots and days left
// WITHOUT the desktop app. The campaign grid and the campaign/search API only
// ever expose campaigns keyed by campaign id; the Messages drawer thinks in brand
// names, so this joins the two (via normalizeBrand, with the same loose fallback
// the Brand Keywords tool uses). Pure and DOM-free: callers feed it records and
// persist the result themselves, so it is unit-tested.

import { normalizeBrand } from "../brand-keywords/normalize";

const DAY_MS = 24 * 60 * 60 * 1000;
// An entry not refreshed within this window is stale (campaigns come and go,
// slots fill) and is dropped rather than shown as current.
export const INDEX_TTL_MS = DAY_MS;
// A campaign past its end date lingers briefly so "ended yesterday" does not
// flicker out mid-session, then is pruned.
const ENDED_GRACE_MS = DAY_MS;
export const MAX_BRANDS = 500;

export type CampaignSource = "api" | "grid";

export type CampaignLite = {
  id: string | null;
  ratePct: number | null;
  endsAt: number | null;
  accepted: number | null;
  required: number | null;
  fullyClaimed: boolean | null;
  source: CampaignSource;
};

export type BrandEntry = {
  brand: string;
  campaigns: CampaignLite[];
  seenAt: number;
};

// Keyed by normalizeBrand(brand).
export type BrandIndex = Record<string, BrandEntry>;

export type IncomingCampaign = {
  brand: string | null;
  campaignId: string | null;
  ratePct: number | null;
  endsAt: number | null;
  accepted?: number | null;
  required?: number | null;
  fullyClaimed?: boolean | null;
  source: CampaignSource;
};

export type CampaignFillLite = {
  accepted: number | null;
  required: number | null;
  fullyClaimed: boolean | null;
};

export type BrandSummary = {
  brand: string;
  bestRatePct: number | null;
  // Whole days until the soonest-ending live campaign finishes (0 = today).
  endsInDays: number | null;
  // Sum of unclaimed slots across live campaigns with known counts, else null.
  openSlots: number | null;
  // Creator slots taken / available across the live campaigns whose counts we
  // know, for a fill meter. Both null when no count is known.
  slotsTaken: number | null;
  slotsTotal: number | null;
  liveCampaigns: number;
  // The highest-rate live campaign that has an id (what Accept would target).
  bestCampaignId: string | null;
  // True when every live campaign we know the fill of is fully claimed.
  allClaimed: boolean;
};

function identity(c: Pick<CampaignLite, "id" | "ratePct" | "endsAt">): string {
  return c.id ? `id:${c.id}` : `r:${c.ratePct ?? "?"}|e:${c.endsAt ?? "?"}`;
}

// Merge `incoming` into a copy of `index`. The grid is read straight from the
// rendered cards (verified live), the API fields are best-effort probes, so on a
// conflict the grid wins for rate and end date; fill counts take the newest
// non-null value from either side.
export function mergeCampaigns(
  index: BrandIndex,
  incoming: IncomingCampaign[],
  now: number,
): BrandIndex {
  const next: BrandIndex = { ...index };
  for (const rec of incoming) {
    if (!rec.brand) continue;
    const key = normalizeBrand(rec.brand);
    if (!key) continue;
    const existing = next[key];
    const entry: BrandEntry = existing
      ? { ...existing, campaigns: existing.campaigns.slice() }
      : { brand: rec.brand.trim(), campaigns: [], seenAt: now };
    entry.seenAt = now;

    const candidate: CampaignLite = {
      id: rec.campaignId,
      ratePct: rec.ratePct,
      endsAt: rec.endsAt,
      accepted: rec.accepted ?? null,
      required: rec.required ?? null,
      fullyClaimed: rec.fullyClaimed ?? null,
      source: rec.source,
    };
    const at = entry.campaigns.findIndex((c) => identity(c) === identity(candidate));
    const old = at === -1 ? undefined : entry.campaigns[at];
    if (!old) {
      entry.campaigns.push(candidate);
    } else {
      const gridHolds = old.source === "grid" && candidate.source === "api";
      entry.campaigns[at] = {
        id: old.id ?? candidate.id,
        ratePct: gridHolds ? old.ratePct ?? candidate.ratePct : candidate.ratePct ?? old.ratePct,
        endsAt: gridHolds ? old.endsAt ?? candidate.endsAt : candidate.endsAt ?? old.endsAt,
        accepted: candidate.accepted ?? old.accepted,
        required: candidate.required ?? old.required,
        fullyClaimed: candidate.fullyClaimed ?? old.fullyClaimed,
        source: old.source === "grid" ? "grid" : candidate.source,
      };
    }
    next[key] = entry;
  }
  return next;
}

// Apply fill counts (from the connect-hook's campaign-fill event, keyed by
// campaign id) to any campaign we already know.
export function applyFills(
  index: BrandIndex,
  fills: Record<string, CampaignFillLite>,
): BrandIndex {
  let changed = false;
  const next: BrandIndex = {};
  for (const [key, entry] of Object.entries(index)) {
    let entryChanged = false;
    const campaigns = entry.campaigns.map((c) => {
      const fill = c.id ? fills[c.id] : undefined;
      if (!fill) return c;
      entryChanged = true;
      return {
        ...c,
        accepted: fill.accepted ?? c.accepted,
        required: fill.required ?? c.required,
        fullyClaimed: fill.fullyClaimed ?? c.fullyClaimed,
      };
    });
    if (entryChanged) changed = true;
    next[key] = entryChanged ? { ...entry, campaigns } : entry;
  }
  return changed ? next : index;
}

// Drop stale entries, long-ended campaigns, and anything past the brand cap
// (oldest seen first).
export function pruneIndex(index: BrandIndex, now: number): BrandIndex {
  const kept: Array<[string, BrandEntry]> = [];
  for (const [key, entry] of Object.entries(index)) {
    if (!entry || now - entry.seenAt > INDEX_TTL_MS) continue;
    const campaigns = entry.campaigns.filter(
      (c) => c.endsAt === null || c.endsAt + ENDED_GRACE_MS >= now,
    );
    if (campaigns.length === 0) continue;
    kept.push([key, campaigns.length === entry.campaigns.length ? entry : { ...entry, campaigns }]);
  }
  kept.sort((a, b) => b[1].seenAt - a[1].seenAt);
  return Object.fromEntries(kept.slice(0, MAX_BRANDS));
}

function isLive(c: CampaignLite, now: number): boolean {
  return c.endsAt === null || c.endsAt > now;
}

export function summarizeBrand(entry: BrandEntry, now: number): BrandSummary | null {
  const live = entry.campaigns.filter((c) => isLive(c, now));
  if (live.length === 0) return null;

  let bestRatePct: number | null = null;
  let best: CampaignLite | null = null;
  let soonestEnd: number | null = null;
  let openSlots: number | null = null;
  let slotsTaken: number | null = null;
  let slotsTotal: number | null = null;
  let known = 0;
  let claimed = 0;

  for (const c of live) {
    if (c.ratePct !== null && (bestRatePct === null || c.ratePct > bestRatePct)) {
      bestRatePct = c.ratePct;
    }
    if (c.id && !c.fullyClaimed) {
      if (!best || (c.ratePct ?? 0) > (best.ratePct ?? 0)) best = c;
    }
    if (c.endsAt !== null && (soonestEnd === null || c.endsAt < soonestEnd)) soonestEnd = c.endsAt;
    if (c.accepted !== null && c.required !== null) {
      slotsTaken = (slotsTaken ?? 0) + c.accepted;
      slotsTotal = (slotsTotal ?? 0) + c.required;
      known += 1;
      if (c.fullyClaimed) claimed += 1;
      else openSlots = (openSlots ?? 0) + Math.max(c.required - c.accepted, 0);
    } else if (c.fullyClaimed !== null) {
      known += 1;
      if (c.fullyClaimed) claimed += 1;
    }
  }

  return {
    brand: entry.brand,
    bestRatePct,
    endsInDays: soonestEnd === null ? null : Math.max(0, Math.ceil((soonestEnd - now) / DAY_MS)),
    openSlots,
    slotsTaken,
    slotsTotal,
    liveCampaigns: live.length,
    bestCampaignId: best?.id ?? null,
    allClaimed: known > 0 && claimed === known,
  };
}

// Resolve a brand name from the Messages widget to its entry: exact normalized
// key first, then the whitespace-insensitive fallback ("K KAMERIO" vs "KKAMERIO").
export function lookupBrandEntry(index: BrandIndex, displayName: string): BrandEntry | null {
  const key = normalizeBrand(displayName);
  if (!key) return null;
  const exact = index[key];
  if (exact) return exact;
  const loose = key.replace(/\s+/g, "");
  for (const [k, entry] of Object.entries(index)) {
    if (k.replace(/\s+/g, "") === loose) return entry;
  }
  return null;
}
