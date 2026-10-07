import {
  AUTO_ACCEPT_DELAY_MAX_MS,
  AUTO_ACCEPT_DELAY_MIN_MS,
  AUTO_ACCEPT_TAB_DWELL_MS,
} from "../../shared/constants";
import { log } from "../../shared/log";
import {
  sendToBackground,
  type AcceptLedgerView,
  type AcceptOutcome,
  type AutoAcceptStopReason,
  type AutoAcceptedItem,
  type MatchedAsinsResult,
  type RuntimeMessage,
} from "../../shared/messages";
import {
  applyCampaignFills,
  daysUntil,
  readCampaignGrid,
  readSpccGrid,
  type BudgetAvailability,
  type CampaignFill,
} from "../../amazon/creator-campaigns";
import {
  clampAutoAcceptDailyCap,
  clampAutoAcceptPerRunCap,
  type AutoAcceptSettings,
  type Settings,
} from "../../storage/schema";
import { bandFor, campaignFillPct, computeCampaignScore, computeSpccScore } from "./score";
import { runAcceptOnPage } from "./accept-runner";
import { activateSpccTab, runAcceptSpccByAsin, spccKey } from "./spcc-runner";

// "Accept campaigns that match rules you set": the rule-based accept pass.
//
// OPT-IN, capped, and remotely killable. The creator writes the rules on the
// options page (minimum commission, which Campaign Radar bands qualify, skip
// anything ending soon, a daily cap and a per-check cap). Every 30 minutes the
// Last Call poll (background/last-call.ts) opens the Creator Connections grid in
// a background tab; once the grid's fill report has landed, the worker sends
// RUN_AUTO_ACCEPT and this module, running in that tab, reads the cards, keeps
// the ones that pass every rule and are not already in the accept ledger, and
// clicks Amazon's OWN Accept button on each pick through the same in-page
// runner a manual click uses (accept-runner.ts), with a human-paced gap between
// clicks. It never replays Amazon's API. The outcome goes back as
// AUTO_ACCEPT_DONE; the worker records the ledger and posts one summary.
//
// The rule evaluation (evaluateAutoAccept) is pure and unit-tested; the DOM
// reader and the click loop are validated by live QA.

// One campaign card as the rules see it. Built from the grid by
// candidatesFromGrid; tests build them by hand.
export type AutoAcceptCandidate = {
  campaignId: string | null;
  brand: string | null;
  commissionRatePct: number | null;
  remainingBudgetCents: number | null;
  endsAt: Date | null;
  // Creator slots claimed vs. cap, from the API fill capture (null = unknown).
  fillPct: number | null;
  fullyClaimed: boolean | null;
  // The card still shows Amazon's own Accept button (an accepted / pending /
  // declined card has none, and a card without one cannot be accepted anyway).
  hasAcceptButton: boolean;
  // Personal signals for the score. The grid overlay enriches these from order
  // history / the desktop ledger; the background pass has neither at hand and
  // leaves them null (neutral), which is documented on the options card.
  owned?: boolean | null;
  provenEarner?: boolean | null;
  // The product ASINs the card is for (CC cards usually have one). Read by the
  // "matched products only" scope; absent / empty never matches.
  asins?: string[];
  // SPCC cards: Amazon's estimated-EPC ceiling (cents) and budget availability.
  // An SPCC row has no campaignId; it is keyed by its ASIN (spccKey).
  kind?: "cc" | "spcc";
  epcCents?: number | null;
  budgetAvailability?: BudgetAvailability | null;
};

// The parts of the ledger the rules read: today's count (for the daily cap)
// and both id lists (today's items + the 30-day history) for the dedupe.
export type AutoAcceptLedgerLike = Pick<AcceptLedgerView, "count" | "items" | "history">;

// A pick with the score it was ranked by, so a caller can log / explain it.
export type AutoAcceptPick<T extends AutoAcceptCandidate> = { row: T; score: number };

// Pure: whole days until the card's end date (calendar days, local), or null
// when the card showed no end date.
export function candidateDaysRemaining(row: AutoAcceptCandidate, now: number): number | null {
  return row.endsAt ? daysUntil(row.endsAt, new Date(now)) : null;
}

// Pure: the rule-based selection. Keeps a card only when EVERY rule passes:
//   - it has a campaign id and still shows Amazon's Accept button;
//   - it is not fully claimed;
//   - its commission rate is known and >= rules.minCommissionPct;
//   - its end date is known and at least rules.excludeEndingWithinHours / 24
//     whole days away (an unknown end date is skipped, not waved through: this
//     pass clicks on the creator's behalf, so it is conservative);
//   - its Campaign Radar band (bandFor(computeCampaignScore)) is in rules.bands;
//   - its id is not in the ledger (today's items or the 30-day history);
//   - in the default "matched" scope, one of its ASINs is in `matched` (the
//     creator's storefront + order-history products). A null / empty `matched`
//     set accepts nothing in that scope: the creator has not told us which
//     products they feature yet, so we never fall back to accepting everything.
// Then the survivors are sorted by score (best first, ties keep grid order) and
// cut to min(perRunCap, dailyCap - ledger.count), never below zero. The caps
// are re-clamped here so a hand-edited storage value cannot lift the ceiling.
export function evaluateAutoAccept<T extends AutoAcceptCandidate>(
  rows: T[],
  rules: AutoAcceptSettings,
  ledger: AutoAcceptLedgerLike,
  now: number,
  matched: ReadonlySet<string> | null = null,
): T[] {
  return rankAutoAccept(rows, rules, ledger, now, matched).map((p) => p.row);
}

// Pure: does the card's product belong to the creator (storefront / orders)?
export function candidateIsMatched(
  row: AutoAcceptCandidate,
  matched: ReadonlySet<string> | null,
): boolean {
  if (!matched || matched.size === 0) return false;
  return (row.asins ?? []).some((a) => matched.has(a.toUpperCase()));
}

export function rankAutoAccept<T extends AutoAcceptCandidate>(
  rows: T[],
  rules: AutoAcceptSettings,
  ledger: AutoAcceptLedgerLike,
  now: number,
  matched: ReadonlySet<string> | null = null,
): Array<AutoAcceptPick<T>> {
  const matchedOnly = rules.scope !== "rules";
  const minDays = Math.max(0, rules.excludeEndingWithinHours) / 24;
  const bands = new Set(rules.bands);
  const taken = new Set<string>([
    ...ledger.items.map((i) => i.campaignId),
    ...ledger.history.map((h) => h.campaignId),
  ]);

  const picks: Array<AutoAcceptPick<T>> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.campaignId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!row.hasAcceptButton) continue;
    if (row.fullyClaimed === true) continue;
    if (matchedOnly && !candidateIsMatched(row, matched)) continue;
    if (row.commissionRatePct === null || row.commissionRatePct < rules.minCommissionPct) continue;
    const days = candidateDaysRemaining(row, now);
    if (days === null || days < minDays) continue;
    const score = computeCampaignScore({
      commissionRatePct: row.commissionRatePct,
      daysRemaining: days,
      remainingBudgetCents: row.remainingBudgetCents,
      owned: row.owned ?? null,
      provenEarner: row.provenEarner ?? null,
      fillPct: row.fillPct,
      fullyClaimed: row.fullyClaimed,
    }).score;
    if (!bands.has(bandFor(score))) continue;
    if (taken.has(id)) continue;
    picks.push({ row, score });
  }

  // Stable sort: equal scores keep the grid's own order.
  const ranked = picks
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || a.i - b.i)
    .map(({ p }) => p);

  const dailyRoom = clampAutoAcceptDailyCap(rules.dailyCap) - Math.max(0, ledger.count);
  const cap = Math.max(0, Math.min(clampAutoAcceptPerRunCap(rules.perRunCap), dailyRoom));
  return ranked.slice(0, cap);
}

const BUDGET_RANK: Record<BudgetAvailability, number> = { low: 0, medium: 1, high: 2 };

// Pure: the SPCC selection. SPCC cards have no commission, date or fill, so the
// rules are the SPCC thresholds instead: the card still shows Accept, its
// estimated EPC ceiling is at least rules.spccMinEpcCents, its budget
// availability is at least rules.spccMinBudget (an unknown EPC or budget is
// skipped, not waved through, like the CC rules), it is in the matched set when
// the scope is "matched", and its `spcc:<ASIN>` key is not in the ledger. Sorted
// by computeSpccScore (best first, ties keep grid order) and cut to `room`.
export function rankSpccAutoAccept<T extends AutoAcceptCandidate>(
  rows: T[],
  rules: AutoAcceptSettings,
  ledger: AutoAcceptLedgerLike,
  matched: ReadonlySet<string> | null,
  room: number,
): Array<AutoAcceptPick<T>> {
  const matchedOnly = rules.scope !== "rules";
  const taken = new Set<string>([
    ...ledger.items.map((i) => i.campaignId),
    ...ledger.history.map((h) => h.campaignId),
  ]);
  const picks: Array<AutoAcceptPick<T>> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const asin = row.asins?.[0]?.toUpperCase();
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);
    if (!row.hasAcceptButton) continue;
    if (matchedOnly && !candidateIsMatched(row, matched)) continue;
    if (row.epcCents === null || row.epcCents === undefined) continue;
    if (row.epcCents < rules.spccMinEpcCents) continue;
    if (!row.budgetAvailability) continue;
    if (BUDGET_RANK[row.budgetAvailability] < BUDGET_RANK[rules.spccMinBudget]) continue;
    if (taken.has(spccKey(asin))) continue;
    const score = computeSpccScore({
      commissionRatePct: null,
      daysRemaining: null,
      remainingBudgetCents: null,
      owned: row.owned ?? null,
      provenEarner: row.provenEarner ?? null,
      epcCents: row.epcCents,
      budgetAvailability: row.budgetAvailability,
    }).score;
    picks.push({ row, score });
  }
  return picks
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || a.i - b.i)
    .map(({ p }) => p)
    .slice(0, Math.max(0, room));
}

// Read the SPCC tab's cards into candidates (the tab must already be active).
export function spccCandidatesFromGrid(doc: Document): AutoAcceptCandidate[] {
  return readSpccGrid(doc).map((c) => ({
    campaignId: null,
    brand: c.brand,
    commissionRatePct: null,
    remainingBudgetCents: null,
    endsAt: null,
    fillPct: null,
    fullyClaimed: null,
    hasAcceptButton: !!Array.from(c.el.querySelectorAll<HTMLElement>("button")).some(
      (b) => /^accept$/i.test((b.textContent ?? "").trim()) && !(b as HTMLButtonElement).disabled,
    ),
    owned: null,
    provenEarner: null,
    asins: c.asins,
    kind: "spcc" as const,
    epcCents: c.epcCents,
    budgetAvailability: c.budgetAvailability,
  }));
}

// Read the grid's cards into candidates. Fill data (slots / fully claimed) is
// API-only, so the content script's captured fill map is merged in first.
export function candidatesFromGrid(
  doc: Document,
  fills: Record<string, CampaignFill>,
): AutoAcceptCandidate[] {
  const campaigns = readCampaignGrid(doc);
  applyCampaignFills(campaigns, fills);
  return campaigns.map((c) => ({
    campaignId: c.campaignId,
    brand: c.brand,
    commissionRatePct: c.commissionRatePct,
    remainingBudgetCents: c.remainingBudgetCents,
    endsAt: c.endsAt,
    fillPct: campaignFillPct(c.slotsFilled, c.slotsTotal),
    fullyClaimed: c.fullyClaimed,
    hasAcceptButton: !!c.el.querySelector('[data-testid$="-campaign-card-accept-btn"]'),
    owned: null,
    provenEarner: null,
    asins: c.asins,
  }));
}

// ---- The in-tab run -----------------------------------------------------------

export type AutoAcceptRunResult = {
  accepted: AutoAcceptedItem[];
  stoppedReason: AutoAcceptStopReason | null;
};

// Every side effect is injectable so the loop can be exercised without a DOM.
export type AutoAcceptDeps = {
  readCandidates: () => AutoAcceptCandidate[];
  getLedger: () => Promise<AcceptLedgerView>;
  // The matched-products set for the "matched" scope (null = unknown / none).
  getMatched: () => Promise<Set<string> | null>;
  accept: (campaignId: string) => Promise<AcceptOutcome>;
  // The SPCC half of a pass: switch the grid to the SPCC tab (false = could not
  // confirm it), read its cards, and accept one by ASIN.
  activateSpcc: () => Promise<boolean>;
  readSpccCandidates: () => AutoAcceptCandidate[];
  acceptSpcc: (asin: string) => Promise<AcceptOutcome>;
  report: (message: RuntimeMessage) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  now: () => number;
};

// A run must report before the worker's tab dwell (AUTO_ACCEPT_TAB_DWELL_MS)
// closes the tab, or accepted campaigns would go unrecorded. Each accept can
// take up to ~27s (jitter + card find + confirm watch), and the tab first waits
// up to ~14s for the grid to render, so no new accept is started once this much
// of the dwell has elapsed (60s of the dwell stays in reserve).
export const AUTO_ACCEPT_RUN_BUDGET_MS = AUTO_ACCEPT_TAB_DWELL_MS - 60_000;

// Pure: a human-paced gap, uniformly jittered in [MIN, MAX].
export function jitterDelay(random: number): number {
  const span = AUTO_ACCEPT_DELAY_MAX_MS - AUTO_ACCEPT_DELAY_MIN_MS;
  return Math.round(AUTO_ACCEPT_DELAY_MIN_MS + Math.min(1, Math.max(0, random)) * span);
}

// The grid is a React SPA: the cards render after its own campaign fetch, and
// the fill capture (slots / fully claimed) lands with that same fetch. Wait for
// the first, then a little for the second, so a "fully claimed" card is not
// mistaken for an open one. Bounded; a signed-out grid just times out and the
// pass finds nothing to accept.
const GRID_WAIT_MS = 12_000;
const FILLS_WAIT_MS = 4_000;
const WAIT_TICK_MS = 400;

export async function waitForGridReady(
  doc: Document,
  fillCount: () => number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  for (let waited = 0; waited < GRID_WAIT_MS; waited += WAIT_TICK_MS) {
    if (readCampaignGrid(doc).some((c) => c.campaignId)) break;
    await sleep(WAIT_TICK_MS);
  }
  for (let waited = 0; waited < FILLS_WAIT_MS && fillCount() === 0; waited += WAIT_TICK_MS) {
    await sleep(WAIT_TICK_MS);
  }
}

// Run one pass over the grid: pick by the rules, click each pick with a
// jittered pause before it, stop on the first accept that does not go through
// (a blocked page, an error toast, a card that never confirmed...), and post
// AUTO_ACCEPT_DONE. Returns the same payload for the message reply.
export async function runAutoAccept(
  settings: Settings,
  fills: Record<string, CampaignFill> = {},
  overrides: Partial<AutoAcceptDeps> = {},
): Promise<AutoAcceptRunResult> {
  const deps: AutoAcceptDeps = {
    readCandidates: () => candidatesFromGrid(document, fills),
    getLedger: () => sendToBackground<AcceptLedgerView>({ kind: "GET_ACCEPT_LEDGER" }),
    getMatched: async () => {
      const res = await sendToBackground<MatchedAsinsResult>({ kind: "GET_MATCHED_ASINS" });
      return new Set(res.asins);
    },
    accept: runAcceptOnPage,
    activateSpcc: () => activateSpccTab(document),
    readSpccCandidates: () => spccCandidatesFromGrid(document),
    acceptSpcc: (asin) => runAcceptSpccByAsin(asin),
    report: (message) => sendToBackground(message),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    now: Date.now,
    ...overrides,
  };

  const result = await runPass(settings, deps);
  await deps.report({ kind: "AUTO_ACCEPT_DONE", ...result }).catch((error) => {
    log("auto-accept", "AUTO_ACCEPT_DONE send failed", error);
  });
  return result;
}

async function runPass(settings: Settings, deps: AutoAcceptDeps): Promise<AutoAcceptRunResult> {
  const accepted: AutoAcceptedItem[] = [];
  const rules = settings.autoAccept;
  if (!rules.enabled || !settings.tools.autoAccept) {
    return { accepted, stoppedReason: "disabled" };
  }

  let ledger: AcceptLedgerView;
  try {
    ledger = await deps.getLedger();
  } catch (error) {
    log("auto-accept", "ledger read failed", error);
    return { accepted, stoppedReason: "error" };
  }
  const started = deps.now();
  if (ledger.cooldownUntil !== null && ledger.cooldownUntil > started) {
    return { accepted, stoppedReason: "cooldown" };
  }

  let matched: Set<string> | null = null;
  if (rules.scope !== "rules") {
    try {
      matched = await deps.getMatched();
    } catch (error) {
      log("auto-accept", "matched products read failed", error);
      return { accepted, stoppedReason: "error" };
    }
  }

  const picks = rankAutoAccept(deps.readCandidates(), rules, ledger, started, matched);
  log("auto-accept", `${picks.length} campaign(s) match the rules`);
  // One shared cap for the whole pass: CC picks use it first, SPCC gets what is left.
  const passCap = Math.max(
    0,
    Math.min(
      clampAutoAcceptPerRunCap(rules.perRunCap),
      clampAutoAcceptDailyCap(rules.dailyCap) - Math.max(0, ledger.count),
    ),
  );

  for (const pick of picks) {
    const id = pick.row.campaignId;
    if (!id) continue;
    if (deps.now() - started > AUTO_ACCEPT_RUN_BUDGET_MS) {
      return { accepted, stoppedReason: "timeout" };
    }
    await deps.sleep(jitterDelay(deps.random()));
    let outcome: AcceptOutcome;
    try {
      outcome = await deps.accept(id);
    } catch (error) {
      log("auto-accept", "accept threw", error);
      outcome = { ok: false, reason: "error" };
    }
    if (!outcome.ok) {
      log("auto-accept", `stopped on ${id}: ${outcome.reason}`);
      return { accepted, stoppedReason: outcome.reason };
    }
    accepted.push({
      campaignId: id,
      brand: pick.row.brand,
      kind: "cc",
      asin: pick.row.asins?.[0] ?? null,
    });
  }

  return runSpccPhase(rules, deps, ledger, matched, passCap, started, accepted);
}

// The SPCC half of a pass: only when the creator included SPCC and there is room
// left under the shared cap and the run budget. Same discipline as the CC loop:
// human-paced gaps, stop on the first accept that does not go through.
async function runSpccPhase(
  rules: AutoAcceptSettings,
  deps: AutoAcceptDeps,
  ledger: AcceptLedgerView,
  matched: Set<string> | null,
  passCap: number,
  started: number,
  accepted: AutoAcceptedItem[],
): Promise<AutoAcceptRunResult> {
  const room = passCap - accepted.length;
  if (!rules.includeSpcc || room <= 0) return { accepted, stoppedReason: null };
  if (deps.now() - started > AUTO_ACCEPT_RUN_BUDGET_MS) return { accepted, stoppedReason: null };

  let active = false;
  try {
    active = await deps.activateSpcc();
  } catch (error) {
    log("auto-accept", "SPCC tab switch failed", error);
  }
  // Not confirmed: skip SPCC quietly (the CC half already ran); never click an
  // unconfirmed grid.
  if (!active) return { accepted, stoppedReason: null };

  const spccPicks = rankSpccAutoAccept(deps.readSpccCandidates(), rules, ledger, matched, room);
  log("auto-accept", `${spccPicks.length} SPCC campaign(s) match the rules`);
  for (const pick of spccPicks) {
    const asin = pick.row.asins?.[0];
    if (!asin) continue;
    if (deps.now() - started > AUTO_ACCEPT_RUN_BUDGET_MS) {
      return { accepted, stoppedReason: "timeout" };
    }
    await deps.sleep(jitterDelay(deps.random()));
    let outcome: AcceptOutcome;
    try {
      outcome = await deps.acceptSpcc(asin);
    } catch (error) {
      log("auto-accept", "SPCC accept threw", error);
      outcome = { ok: false, reason: "error" };
    }
    if (!outcome.ok) {
      log("auto-accept", `stopped on SPCC ${asin}: ${outcome.reason}`);
      return { accepted, stoppedReason: outcome.reason };
    }
    accepted.push({ campaignId: spccKey(asin), brand: pick.row.brand, kind: "spcc", asin });
  }
  return { accepted, stoppedReason: null };
}
