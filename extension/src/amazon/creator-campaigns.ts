// Reads the Amazon Creator Connections campaign grid: the browse page where a
// creator sees the campaigns they can accept, each card showing a commission
// rate, remaining budget, and a date range. Campaign Radar scores and highlights
// these cards (tools/campaign-radar).
//
// Verified live 2026-07-10 (US, littleprettyl-20): the grid is a React SPA on the
// associates host affiliate-program.amazon.com at /p/connect/requests. It has two
// tabs sharing that path via the `type` query param: "Affiliate+ campaigns"
// (type=affiliate-plus, the classic Creator Connections cards this parser targets)
// and "Sponsored Products for Creators" (type=spcc, a different card schema with
// EPC + a budget-availability score and no commission/date fields). There is NO
// `script[type="a-state"]` payload for the grid, so we read the DOM. Each CC card
// exposes stable data-testids, which we prefer:
//   campaign-card-brand-name          -> "YHSF"
//   campaign-card-campaign-name       -> "YHSF - Mink Blankets July/Aug"
//   campaign-card-campaign-commission-rate -> "10%"
//   campaign-card-campaign-budget     -> "$1,000,000.00"
//   campaign-card-campaign-date-range -> "7/13/26 - 8/13/26"
//   <campaignId>-campaign-card-accept-btn (campaign id embedded in the testid)
// The whole-card text parser (parseCampaignText) is kept as a resilient fallback
// for when Amazon renames a testid. CC cards carry no product ASIN (they are
// brand-level), so Phase 2 owned/earner enrichment degrades to neutral there;
// SPCC cards do carry "ASIN: XXXXXXXXXX" in text.
//
// The text/date extraction functions are pure and unit-tested; the DOM readers
// are validated by the live smoke test.

export type Campaign = {
  // The card element, so the overlay can badge / border / reorder it.
  el: HTMLElement;
  brand: string | null;
  commissionRatePct: number | null;
  remainingBudgetCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  // Product ASINs referenced by the card. Often empty at grid level (the
  // products may hide behind a "Check Product Opportunities" expander); Phase 2
  // enrichment degrades gracefully when this is empty.
  asins: string[];
};

const ASIN_LINK_RE = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/g;
// "ASIN: B0F8VC16BM" rendered in an SPCC card's text.
const ASIN_TEXT_RE = /\bASIN[:\s]+([A-Z0-9]{10})\b/gi;
const COMMISSION_RE = /commission\s*rate\s*:?\s*([\d.]+)\s*%/i;
// The bare commission value a card's commission testid holds, e.g. "10%".
const PCT_RE = /([\d.]+)\s*%/;
// "Remaining budget: $5,000.00" (also matches "Budget: $10,000" and a bare
// "$1,000,000.00" from the budget testid element).
const BUDGET_RE = /(?:remaining\s*)?budget\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i;
const BARE_MONEY_RE = /\$?\s*([\d,]+(?:\.\d{1,2})?)/;
// Two M/D/YY dates separated by a hyphen, an en/em dash (U+2013 / U+2014, written
// as escapes to keep the source dash-free), or "to". The date-range testid holds
// just "7/13/26 - 8/13/26"; DATES_RE additionally requires a "Dates:" label for
// the whole-card fallback so it does not grab an unrelated date pair.
const RANGE_RE =
  /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:-|\u2013|\u2014|to)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
const DATES_RE = new RegExp(`dates?\\s*:?\\s*${RANGE_RE.source}`, "i");

// Parse a US-style M/D/YY or M/D/YYYY date (Amazon US Creator Hub) into a Date at
// local midnight, or null if it does not look like a date. Two-digit years map to
// 2000-2099, which is correct for campaign windows.
export function parseUsDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  // Reject overflow (e.g. 2/31 rolling into March).
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

// Whole days from `now` until `end` (calendar days, so "today" is 0 and a date
// already past is negative). Both are floored to local midnight first so a
// campaign ending today is not counted as fractional.
export function daysUntil(end: Date, now: Date): number {
  const endMid = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((endMid - nowMid) / 86_400_000);
}

// Pure: pull the numeric fields out of a card's visible text. Exported for tests.
export function parseCampaignText(text: string): {
  commissionRatePct: number | null;
  remainingBudgetCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
} {
  const rate = text.match(COMMISSION_RE);
  const commissionRatePct = rate && rate[1] ? clampNum(parseFloat(rate[1])) : null;

  const budget = text.match(BUDGET_RE);
  const remainingBudgetCents =
    budget && budget[1]
      ? clampNum(Math.round(parseFloat(budget[1].replace(/,/g, "")) * 100))
      : null;

  const dates = text.match(DATES_RE);
  const startsAt = dates && dates[1] ? parseUsDate(dates[1]) : null;
  const endsAt = dates && dates[2] ? parseUsDate(dates[2]) : null;

  return { commissionRatePct, remainingBudgetCents, startsAt, endsAt };
}

function clampNum(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

// Product ASINs referenced anywhere inside the card (dp / gp links, or a
// data-asin attribute), de-duplicated and upper-cased.
export function extractCampaignAsins(el: HTMLElement): string[] {
  const found = new Set<string>();
  for (const a of Array.from(el.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    ASIN_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ASIN_LINK_RE.exec(href))) {
      if (m[1]) found.add(m[1].toUpperCase());
    }
  }
  for (const node of Array.from(el.querySelectorAll("[data-asin]"))) {
    const asin = (node.getAttribute("data-asin") ?? "").trim().toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(asin)) found.add(asin);
  }
  // SPCC cards render the ASIN as plain text ("ASIN: B0F8VC16BM").
  ASIN_TEXT_RE.lastIndex = 0;
  let am: RegExpExecArray | null;
  const text = el.textContent ?? "";
  while ((am = ASIN_TEXT_RE.exec(text))) {
    if (am[1]) found.add(am[1].toUpperCase());
  }
  return [...found];
}

// Parse the value the CC card's dedicated field testids hold. Each holds only the
// value (no label): commission "10%", budget "$1,000,000.00", dates
// "7/13/26 - 8/13/26".
export function parsePctText(text: string | null | undefined): number | null {
  const m = (text ?? "").match(PCT_RE);
  return m && m[1] ? clampNum(parseFloat(m[1])) : null;
}

export function parseBudgetText(text: string | null | undefined): number | null {
  const m = (text ?? "").match(BARE_MONEY_RE);
  return m && m[1] ? clampNum(Math.round(parseFloat(m[1].replace(/,/g, "")) * 100)) : null;
}

export function parseDateRange(text: string | null | undefined): {
  startsAt: Date | null;
  endsAt: Date | null;
} {
  const m = (text ?? "").match(RANGE_RE);
  return {
    startsAt: m && m[1] ? parseUsDate(m[1]) : null,
    endsAt: m && m[2] ? parseUsDate(m[2]) : null,
  };
}

// The brand / campaign title. Best-effort: the first heading-ish element, else
// the first non-empty text line. The commission/budget/date lines are stripped so
// the title is not "Commission rate: 10%".
function readBrand(el: HTMLElement): string | null {
  const heading = el.querySelector("h1, h2, h3, h4, h5, [role='heading'], strong, b");
  const headingText = heading?.textContent?.trim();
  if (headingText && !COMMISSION_RE.test(headingText) && !BUDGET_RE.test(headingText)) {
    return headingText;
  }
  const firstLine = (el.textContent ?? "")
    .split("\n")
    .map((s) => s.trim())
    .find(
      (s) =>
        s.length > 0 &&
        !COMMISSION_RE.test(s) &&
        !BUDGET_RE.test(s) &&
        !DATES_RE.test(s) &&
        !/^(accept|not interested|view details|track|check product)/i.test(s),
    );
  return firstLine ?? null;
}

// Parse one campaign card element. Returns null when the element has no
// commission rate AND no date range (i.e. it is not really a campaign card).
export function parseCampaignCard(el: HTMLElement): Campaign | null {
  const fields = parseCampaignText(el.textContent ?? "");
  if (fields.commissionRatePct === null && fields.endsAt === null) return null;
  return {
    el,
    brand: readBrand(el),
    commissionRatePct: fields.commissionRatePct,
    remainingBudgetCents: fields.remainingBudgetCents,
    startsAt: fields.startsAt,
    endsAt: fields.endsAt,
    asins: extractCampaignAsins(el),
  };
}

// The element's own direct text (its immediate text-node children), so we can
// find the node that literally renders "Commission rate: N%" rather than every
// ancestor that merely contains it.
function directText(el: HTMLElement): string {
  let s = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* text */) s += node.textContent ?? "";
  }
  return s;
}

// How far to climb from a rate line looking for its card container before giving
// up (guards against selecting the whole grid / page).
const MAX_CARD_CLIMB = 6;

// Find the campaign card elements in the document. Heuristic and marked
// UNVERIFIED: we do not yet know Amazon's card class names, so we seed on each
// element that literally renders a "Commission rate: N%" line, then climb to the
// nearest ancestor that adds the campaign's context (a date range or a budget
// line) - that ancestor is the card. This mirrors the card-climbing approach in
// retag-butler-mobile-lens.js. Once the real card selector is confirmed on a live
// page, prefer it here and keep this as the fallback.
export function findCampaignCards(root: ParentNode): HTMLElement[] {
  const seeds = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((el) =>
    COMMISSION_RE.test(directText(el)),
  );

  const cards = new Set<HTMLElement>();
  for (const seed of seeds) {
    // If the rate line already sits in a block with a date/budget, that block is
    // the card; otherwise climb until an ancestor supplies that context.
    let node: HTMLElement | null = seed;
    let hops = 0;
    while (node && hops <= MAX_CARD_CLIMB) {
      const txt = node.textContent ?? "";
      if (DATES_RE.test(txt) || BUDGET_RE.test(txt)) break;
      node = node.parentElement;
      hops++;
    }
    if (node && node !== (root as unknown as HTMLElement) && node.tagName !== "BODY") {
      cards.add(node);
    }
  }

  // Keep only innermost cards, so a wrapper that happens to contain two cards is
  // dropped in favor of the individual cards inside it.
  const list = [...cards];
  return list.filter((c) => !list.some((other) => other !== c && c.contains(other)));
}

// The stable per-card testids on the CC ("Affiliate+ campaigns") grid.
const TESTID = {
  commission: "campaign-card-campaign-commission-rate",
  brand: "campaign-card-brand-name",
  name: "campaign-card-campaign-name",
  budget: "campaign-card-campaign-budget",
  dateRange: "campaign-card-campaign-date-range",
} as const;

// From a commission-rate element, climb to the card root: the nearest ancestor
// that also holds the brand and date-range testids.
function cardRootFrom(rateEl: HTMLElement): HTMLElement {
  let node: HTMLElement | null = rateEl;
  for (let i = 0; i <= MAX_CARD_CLIMB && node; i++) {
    if (
      node.querySelector(`[data-testid="${TESTID.brand}"]`) &&
      node.querySelector(`[data-testid="${TESTID.dateRange}"]`)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return rateEl;
}

// Preferred reader: one Campaign per CC card, fields read from the stable
// testids. Returns [] when the grid uses no such testids (e.g. the SPCC tab, or a
// markup change), so the caller can fall back to the text heuristic.
export function readCampaignGridByTestId(root: ParentNode): Campaign[] {
  const rateEls = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-testid="${TESTID.commission}"]`),
  );
  const out: Campaign[] = [];
  const seen = new Set<HTMLElement>();
  for (const rateEl of rateEls) {
    const card = cardRootFrom(rateEl);
    if (seen.has(card)) continue;
    seen.add(card);
    const field = (id: string): string | null =>
      card.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
    const { startsAt, endsAt } = parseDateRange(field(TESTID.dateRange));
    out.push({
      el: card,
      brand: field(TESTID.brand) ?? field(TESTID.name),
      commissionRatePct: parsePctText(field(TESTID.commission)),
      remainingBudgetCents: parseBudgetText(field(TESTID.budget)),
      startsAt,
      endsAt,
      asins: extractCampaignAsins(card),
    });
  }
  return out;
}

// Read every campaign on the grid: stable testids first (verified layout), then
// the whole-card text heuristic as a fallback if Amazon renames the testids.
export function readCampaignGrid(doc: Document): Campaign[] {
  const byTestId = readCampaignGridByTestId(doc);
  if (byTestId.length > 0) return byTestId;

  const out: Campaign[] = [];
  for (const el of findCampaignCards(doc)) {
    const campaign = parseCampaignCard(el);
    if (campaign) out.push(campaign);
  }
  return out;
}
