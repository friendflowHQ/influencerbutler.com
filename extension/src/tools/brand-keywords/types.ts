import type { BrandEnrichmentRecord, OutreachRecord } from "../../transport/hud-commands";

export type { BrandEnrichmentRecord, OutreachRecord };

// A brand-keyed lookup built once per fetch. `exact` is keyed by
// normalizeBrand(brand); `loose` by the same with all whitespace removed, so
// drift like "K KAMERIO" vs "KKAMERIO" still resolves. Both point at the same
// collapsed-per-brand records.
export type BrandMap<T> = {
  exact: Map<string, T>;
  loose: Map<string, T>;
};

// The outreach-keyword map (collapsed per brand, latest keyword first).
export type OutreachMap = BrandMap<OutreachRecord>;

// The inbound-brand enrichment map (one CC signal per brand).
export type EnrichmentMap = BrandMap<BrandEnrichmentRecord>;
