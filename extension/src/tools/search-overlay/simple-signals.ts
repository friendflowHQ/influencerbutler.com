// Simple view: three plain-language signals per search tile (Pays, Sells,
// Campaign) in place of the analysis chips. Pure, so the thresholds and wording
// are unit-testable and easy to change. "Well" is relative to the other products
// on the same page (top third), with a fixed fallback when a page has too few
// products to compare. State is always shown as an icon plus words, never color
// alone.

export type SignalState = "good" | "neutral" | "low" | "unknown";
export type SignalKind = "pays" | "sells" | "campaign";

export type Signal = { kind: SignalKind; state: SignalState; text: string; tip: string };

export type Cutoffs = { goodMin: number; neutralMin: number };
export type PageBands = { commission: Cutoffs | null; units: Cutoffs | null };

// A page needs at least this many products with a value before the top-third
// rule means anything; below it, fixed levels apply.
export const MIN_PAGE_SAMPLE = 6;
// Fixed levels used when the page is too small to compare.
export const FALLBACK_COMMISSION_CENTS = { good: 200, neutral: 75 };
export const FALLBACK_UNITS = { good: 300, neutral: 50 };

// Top-third cutoffs over a page's values, or null when there are too few. Ties are
// handled by count, not by index: a value is "good" only if at most a third of the
// page (rounded up) is at or above it, so a page of mostly equal values never
// crowns most of its products. A page where every value is equal has no better
// product, so everything reads neutral.
export function bandsFor(values: ReadonlyArray<number | null>): Cutoffs | null {
  const sorted = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < MIN_PAGE_SAMPLE) return null;
  const distinct = Array.from(new Set(sorted));
  if (distinct.length === 1) return { goodMin: Infinity, neutralMin: -Infinity };
  // How many values are at or above v (sorted ascending, so the first index of v).
  const countAtOrAbove = (v: number): number => n - sorted.indexOf(v);
  const goodMin = distinct.find((v) => countAtOrAbove(v) <= Math.ceil(n / 3)) ?? Infinity;
  // Not low: at most two thirds of the page is at or above. When ties make that
  // impossible, the page minimum alone is low.
  const neutralMin = distinct.find((v) => countAtOrAbove(v) <= Math.ceil((n * 2) / 3)) ?? (distinct[1] as number);
  return { goodMin, neutralMin };
}

export function computeBands(rows: ReadonlyArray<{ commissionCents: number | null; units: number | null }>): PageBands {
  return {
    commission: bandsFor(rows.map((r) => r.commissionCents)),
    units: bandsFor(rows.map((r) => r.units)),
  };
}

export type SimpleInput = {
  commissionCents: number | null;
  // Human text for the commission, e.g. "$2.40". Null when unknown.
  commissionText: string | null;
  units: number | null;
  // True when the units are a local estimate rather than the calibrated shared figure.
  unitsEstimated: boolean;
  // Retailers without Creator Connections (Walmart, Target) get no Campaign signal.
  showCampaign: boolean;
  campaign: { open: boolean; detail: string | null; lookup: "pending" | "done" | "failed" };
};

type Copy = {
  details: string;
  hideDetails: string;
  icons: Record<SignalState, string>;
  pays: Record<SignalState, string>;
  sells: Record<SignalState, string>;
  campaignOpen: string;
  campaignNone: string;
  campaignChecking: string;
  campaignUnknown: string;
  paysTip: (state: SignalState, text: string | null, relative: boolean) => string;
  sellsTip: (state: SignalState, units: number | null, relative: boolean, estimated: boolean) => string;
  campaignTip: (kind: "open" | "none" | "checking" | "unknown", detail: string | null) => string;
};

const ICONS: Record<SignalState, string> = { good: "✓", neutral: "–", low: "↓", unknown: "?" };

const EN: Copy = {
  details: "Details",
  hideDetails: "Hide details",
  icons: ICONS,
  pays: { good: "Pays well", neutral: "Pays average", low: "Pays less", unknown: "Pay unknown" },
  sells: { good: "Sells well", neutral: "Sells average", low: "Sells slowly", unknown: "Sales unknown" },
  campaignOpen: "Campaign open",
  campaignNone: "No campaign",
  campaignChecking: "Checking...",
  campaignUnknown: "Campaign unknown",
  paysTip: (state, text, relative) => {
    if (state === "unknown" || !text) return "Not enough information to estimate what this pays.";
    const how = relative
      ? state === "good" ? "in the top third of this page" : state === "low" ? "in the bottom third of this page" : "in the middle of this page"
      : "a fixed level, because this page has too few products to compare";
    return `About ${text} per sale, ${how}.`;
  },
  sellsTip: (state, units, relative, estimated) => {
    if (state === "unknown" || units === null) return "Not enough information to estimate sales.";
    const how = relative
      ? state === "good" ? "in the top third of this page" : state === "low" ? "in the bottom third of this page" : "in the middle of this page"
      : "a fixed level, because this page has too few products to compare";
    return `About ${units.toLocaleString("en")} sold a month${estimated ? " (estimated)" : ""}, ${how}.`;
  },
  campaignTip: (kind, detail) =>
    kind === "open" ? `An open Creator Connections campaign.${detail ? ` ${detail}` : ""}`
    : kind === "none" ? "No open Creator Connections campaign found for this product."
    : kind === "checking" ? "Checking for an open campaign."
    : "Could not check campaigns. Use Retry in the toolbar.",
};

const ES: Copy = {
  details: "Detalles",
  hideDetails: "Ocultar detalles",
  icons: ICONS,
  pays: { good: "Paga bien", neutral: "Paga normal", low: "Paga menos", unknown: "Pago desconocido" },
  sells: { good: "Se vende bien", neutral: "Ventas normales", low: "Se vende poco", unknown: "Ventas desconocidas" },
  campaignOpen: "Campana abierta",
  campaignNone: "Sin campana",
  campaignChecking: "Comprobando...",
  campaignUnknown: "Campana desconocida",
  paysTip: (state, text, relative) => {
    if (state === "unknown" || !text) return "No hay suficiente informacion para estimar el pago.";
    const how = relative
      ? state === "good" ? "en el tercio superior de esta pagina" : state === "low" ? "en el tercio inferior de esta pagina" : "en el medio de esta pagina"
      : "un nivel fijo, porque esta pagina tiene pocos productos para comparar";
    return `Unos ${text} por venta, ${how}.`;
  },
  sellsTip: (state, units, relative, estimated) => {
    if (state === "unknown" || units === null) return "No hay suficiente informacion para estimar las ventas.";
    const how = relative
      ? state === "good" ? "en el tercio superior de esta pagina" : state === "low" ? "en el tercio inferior de esta pagina" : "en el medio de esta pagina"
      : "un nivel fijo, porque esta pagina tiene pocos productos para comparar";
    return `Unas ${units.toLocaleString("es")} ventas al mes${estimated ? " (estimado)" : ""}, ${how}.`;
  },
  campaignTip: (kind, detail) =>
    kind === "open" ? `Una campana abierta de Creator Connections.${detail ? ` ${detail}` : ""}`
    : kind === "none" ? "No se encontro una campana abierta de Creator Connections para este producto."
    : kind === "checking" ? "Buscando una campana abierta."
    : "No se pudieron comprobar las campanas. Usa Reintentar en la barra.",
};

const FR: Copy = {
  details: "Details",
  hideDetails: "Masquer les details",
  icons: ICONS,
  pays: { good: "Bien paye", neutral: "Paye moyennement", low: "Paye moins", unknown: "Gain inconnu" },
  sells: { good: "Se vend bien", neutral: "Ventes moyennes", low: "Se vend peu", unknown: "Ventes inconnues" },
  campaignOpen: "Campagne ouverte",
  campaignNone: "Pas de campagne",
  campaignChecking: "Verification...",
  campaignUnknown: "Campagne inconnue",
  paysTip: (state, text, relative) => {
    if (state === "unknown" || !text) return "Pas assez d'informations pour estimer le gain.";
    const how = relative
      ? state === "good" ? "dans le tiers superieur de cette page" : state === "low" ? "dans le tiers inferieur de cette page" : "au milieu de cette page"
      : "un niveau fixe, car cette page a trop peu de produits a comparer";
    return `Environ ${text} par vente, ${how}.`;
  },
  sellsTip: (state, units, relative, estimated) => {
    if (state === "unknown" || units === null) return "Pas assez d'informations pour estimer les ventes.";
    const how = relative
      ? state === "good" ? "dans le tiers superieur de cette page" : state === "low" ? "dans le tiers inferieur de cette page" : "au milieu de cette page"
      : "un niveau fixe, car cette page a trop peu de produits a comparer";
    return `Environ ${units.toLocaleString("fr")} ventes par mois${estimated ? " (estime)" : ""}, ${how}.`;
  },
  campaignTip: (kind, detail) =>
    kind === "open" ? `Une campagne Creator Connections ouverte.${detail ? ` ${detail}` : ""}`
    : kind === "none" ? "Aucune campagne Creator Connections ouverte trouvee pour ce produit."
    : kind === "checking" ? "Recherche d'une campagne ouverte."
    : "Impossible de verifier les campagnes. Utilisez Reessayer dans la barre.",
};

export function copyFor(locale: string): Copy {
  if (locale.startsWith("es")) return ES;
  if (locale.startsWith("fr")) return FR;
  return EN;
}

function classify(
  value: number | null,
  cutoffs: Cutoffs | null,
  fallback: { good: number; neutral: number },
  capAtNeutral: boolean,
): { state: SignalState; relative: boolean } {
  if (value === null || !Number.isFinite(value)) return { state: "unknown", relative: false };
  if (cutoffs) {
    const state: SignalState = value >= cutoffs.goodMin ? "good" : value >= cutoffs.neutralMin ? "neutral" : "low";
    return { state, relative: true };
  }
  let state: SignalState = value >= fallback.good ? "good" : value >= fallback.neutral ? "neutral" : "low";
  // A fixed-level "good" on a local estimate would overclaim.
  if (capAtNeutral && state === "good") state = "neutral";
  return { state, relative: false };
}

export function simpleSignals(input: SimpleInput, bands: PageBands, locale: string): Signal[] {
  const c = copyFor(locale);
  const out: Signal[] = [];

  const pays = classify(input.commissionCents, bands.commission, FALLBACK_COMMISSION_CENTS, false);
  out.push({
    kind: "pays",
    state: pays.state,
    text: `${c.icons[pays.state]} ${c.pays[pays.state]}`,
    tip: c.paysTip(pays.state, input.commissionText, pays.relative),
  });

  const sells = classify(input.units, bands.units, FALLBACK_UNITS, input.unitsEstimated);
  out.push({
    kind: "sells",
    state: sells.state,
    text: `${c.icons[sells.state]} ${c.sells[sells.state]}`,
    tip: c.sellsTip(sells.state, input.units, sells.relative, input.unitsEstimated),
  });

  if (input.showCampaign) {
    const { open, lookup, detail } = input.campaign;
    if (open) {
      out.push({ kind: "campaign", state: "good", text: `${c.icons.good} ${c.campaignOpen}`, tip: c.campaignTip("open", detail) });
    } else if (lookup === "pending") {
      out.push({ kind: "campaign", state: "unknown", text: `${c.icons.unknown} ${c.campaignChecking}`, tip: c.campaignTip("checking", null) });
    } else if (lookup === "failed") {
      out.push({ kind: "campaign", state: "unknown", text: `${c.icons.unknown} ${c.campaignUnknown}`, tip: c.campaignTip("unknown", null) });
    } else {
      out.push({ kind: "campaign", state: "neutral", text: `${c.icons.neutral} ${c.campaignNone}`, tip: c.campaignTip("none", null) });
    }
  }
  return out;
}
